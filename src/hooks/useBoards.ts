import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Board } from '../types';

export const useBoards = (
    onBoardSwitch?: () => void
) => {
    const [boards, setBoards] = useState<Board[]>([]);
    const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);

    // Fetch Boards & Subscribe to Realtime Changes
    useEffect(() => {
        // Initial Fetch
        const fetchBoards = async () => {
            console.log("🔥 正在从数据库抓取画板列表...");
            const { data, error } = await supabase.from('boards').select('*').order('created_at', { ascending: true });

            console.log("🔥 正在从数据库抓取画板列表:", data);

            if (data) {
                setBoards(data);
                // If we have boards, try to set the first one as active if none is selected
                if (data.length > 0) {
                    if (!currentBoardId) setCurrentBoardId(data[0].id);
                }
                // ONLY if data is empty, create default.
                else {
                    console.log("未发现画板，正在创建默认画板...");
                    const defaultId = `case-${Date.now()}`;
                    const defaultBoard = {
                        id: defaultId,
                        name: 'Main Case'
                    };

                    try {
                        const { data: newBoard, error: insertError } = await supabase.from('boards').insert([defaultBoard]).select();

                        if (newBoard && newBoard.length > 0) {
                            setBoards(newBoard);
                            setCurrentBoardId(newBoard[0].id);
                        } else if (insertError) {
                            console.error("Default board creation failed:", insertError);
                        }
                    } catch (e) {
                        console.error("Critical error creating default board:", e);
                    }
                }
            } else if (error) {
                console.error("Error fetching boards:", error);
            }
        };

        fetchBoards();

        // Realtime Subscription
        const channel = supabase.channel('realtime-boards')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'boards' },
                (payload) => {
                    console.log('Realtime change received!', payload);

                    if (payload.eventType === 'INSERT') {
                        const newBoard = payload.new as Board;
                        setBoards(prev => {
                            // Deduplicate: Check if board already exists (e.g. from local optimistic add)
                            if (prev.some(b => b.id === newBoard.id)) return prev;
                            return [...prev, newBoard];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedBoard = payload.new as Board;
                        setBoards(prev => prev.map(b => b.id === updatedBoard.id ? updatedBoard : b));

                        // Note: If ID changed, we might need to handle currentBoardId switch, 
                        // but updating ID is complex and handled via full reload or local optimistic update for now.
                        // Ideally, if the current board's ID changed externally, we should update the ref.
                        // But payload.old usually only has ID, so matching old ID might be tricky if we don't have it.
                        // Just refreshing the name for now.
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id; // payload.old contains the ID of the deleted record
                        setBoards(prev => {
                            const nextBoards = prev.filter(b => b.id !== deletedId);
                            return nextBoards;
                        });

                        // If the currently active board was deleted remotely, switch escape
                        setCurrentBoardId(prevId => {
                            if (prevId === deletedId) {
                                // Find next ID from the *fresh* state logic? 
                                // Since we are inside setBoards setState updater, we can't see the 'new' state yet here easily without complexity.
                                // But simple logic: if current deleted, confirm via alert or just switch to first available?
                                // Let's just switch to null first, then useEffect or component will handle empty state?
                                // Actually, better to reload to stay safe or pick the first remaining one from prev list (excluding deleted).
                                // NOTE: This closure has stale 'boards' unless we use functional update.
                                // We can't access nextBoards here.
                                // Let's simplify: User will see "Deleted" state or empty.
                                // We can rely on a separate useEffect to fix invalid currentBoardId if we really wanted to, 
                                // but standard practice is just to let it be or switch to safe default.
                                return null;
                            }
                            return prevId;
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []); // Run once on mount

    // Safety: If currentBoardId becomes null (e.g. deleted via realtime) but boards exist, select first one.
    useEffect(() => {
        if (!currentBoardId && boards.length > 0) {
            setCurrentBoardId(boards[0].id);
        }
    }, [currentBoardId, boards]);

    const addBoard = useCallback(async () => {
        // Fix: Explicitly generate ID to avoid null constraint violation
        const newId = `case-${Date.now()}`;
        const newBoardPayload = {
            id: newId,
            name: `New Case #${boards.length + 1}`
        };

        console.log("Attempting to add board:", newBoardPayload);

        try {
            const { data, error } = await supabase.from('boards').insert([newBoardPayload]).select();

            if (error) {
                console.error("Supabase INSERT error:", error);
                alert("数据库错误: " + error.message);
                return;
            }

            // Fallback: If data is returned, use it. If not, use generated payload.
            const createdBoard = (data && data.length > 0) ? data[0] : newBoardPayload;

            console.log("Board created successfully:", createdBoard);

            // 1. Immediate State Refresh
            setBoards(prev => {
                // Check if already added by realtime subscription to avoid dupes
                if (prev.some(b => b.id === createdBoard.id)) return prev;
                return [...prev, createdBoard];
            });

            // 2. Force Switch
            setCurrentBoardId(createdBoard.id);

            if (onBoardSwitch) onBoardSwitch();

        } catch (e: any) {
            console.error("Unexpected error in addBoard:", e);
            alert("Unexpected Error: " + e.message);
        }
    }, [boards, onBoardSwitch]);

    const renameBoard = useCallback(async (id: string, newName: string) => {
        // Optimistic update
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));

        const { error } = await supabase.from('boards').update({ name: newName }).eq('id', id);
        if (error) {
            console.error("Rename failed", error);
            alert("Rename failed: " + error.message);
        }
    }, []);

    const deleteBoard = useCallback(async (id: string) => {
        if (!window.confirm("Are you sure? This will PERMANENTLY delete this case and ALL its evidence?")) return;

        try {
            // Note: If 'ON DELETE CASCADE' is not set in DB, we must manually delete children
            const { error: notesError } = await supabase.from('notes').delete().eq('board_id', id);
            if (notesError) console.warn("Notes delete warning:", notesError);

            const { error: connsError } = await supabase.from('connections').delete().eq('board_id', id);
            if (connsError) console.warn("Connections delete warning:", connsError);

            const { error } = await supabase.from('boards').delete().eq('id', id);
            if (error) throw error;

            // Local state update happens here, AND via realtime callback. 
            // We can rely on realtime, but optimistic is smoother.
            // Deduplication logic in realtime callback handles this.

            setBoards(prev => {
                const nextBoards = prev.filter(b => b.id !== id);

                // If deleted board was active, switch to another one immediately
                if (currentBoardId === id) {
                    const nextId = nextBoards.length > 0 ? nextBoards[0].id : null;
                    if (nextId) setCurrentBoardId(nextId);
                    else {
                        window.location.reload();
                    }
                }
                return nextBoards;
            });

        } catch (e: any) {
            console.error("Delete failed:", e);
            alert("Delete failed: " + e.message);
        }
    }, [currentBoardId]);

    // Update Board ID
    const updateBoardId = useCallback(async (oldId: string, newId: string) => {
        if (!newId || newId === oldId) return;

        try {
            // 1. Database Update
            const { error } = await supabase.from('boards').update({ id: newId }).eq('id', oldId);

            if (error) {
                throw error;
            }

            // 2. Local State Update
            setBoards(prev => prev.map(b => b.id === oldId ? { ...b, id: newId } : b));

            // 3. Switch Active Context if needed
            if (currentBoardId === oldId) {
                setCurrentBoardId(newId);
            }

            alert("ID Updated Successfully!");

        } catch (e: any) {
            console.error("Update ID failed:", e);
            alert("Update ID failed (Check DB Constraints): " + e.message);
        }
    }, [currentBoardId]);

    return {
        boards,
        currentBoardId,
        setCurrentBoardId,
        addBoard,
        renameBoard,
        deleteBoard,
        updateBoardId
    };
};
