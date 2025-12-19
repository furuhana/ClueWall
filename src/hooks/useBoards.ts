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

            console.log("🔥 数据库返回画板数据:", data);

            if (data && data.length > 0) {
                setBoards(data);
                // Aggressively set current ID to avoid 'loading-board' state
                // We trust that if we have no ID yet, we take the first one.
                setCurrentBoardId(prev => prev || data[0].id);
            }
            else if (data && data.length === 0) {
                // Only create default if TRULY empty
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

            if (error) {
                console.error("Error fetching boards (Full Object):", error, JSON.stringify(error, null, 2));
                alert("无法加载画板数据，请检查网络或权限。错误详情请看控制台。");
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
                            if (prev.some(b => b.id === newBoard.id)) return prev;
                            const next = [...prev, newBoard];
                            setCurrentBoardId(cid => cid || newBoard.id);
                            return next;
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedBoard = payload.new as Board;
                        setBoards(prev => prev.map(b => b.id === updatedBoard.id ? updatedBoard : b));
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        setBoards(prev => {
                            const nextBoards = prev.filter(b => b.id !== deletedId);
                            return nextBoards;
                        });
                        setCurrentBoardId(prevId => {
                            if (prevId === deletedId) return null;
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
            console.log("Detected null ID with existing boards, switching to:", boards[0].id);
            setCurrentBoardId(boards[0].id);
        }
    }, [currentBoardId, boards]);

    const addBoard = useCallback(async () => {
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

            const createdBoard = (data && data.length > 0) ? data[0] : newBoardPayload;

            setBoards(prev => {
                if (prev.some(b => b.id === createdBoard.id)) return prev;
                return [...prev, createdBoard];
            });

            setCurrentBoardId(createdBoard.id);

            if (onBoardSwitch) onBoardSwitch();

        } catch (e: any) {
            console.error("Unexpected error in addBoard:", e);
            alert("Unexpected Error: " + e.message);
        }
    }, [boards, onBoardSwitch]);

    const renameBoard = useCallback(async (id: string, newName: string) => {
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
            const { error: notesError } = await supabase.from('notes').delete().eq('board_id', id);
            if (notesError) console.warn("Notes delete warning:", notesError);

            const { error: connsError } = await supabase.from('connections').delete().eq('board_id', id);
            if (connsError) console.warn("Connections delete warning:", connsError);

            const { error } = await supabase.from('boards').delete().eq('id', id);
            if (error) throw error;

            setBoards(prev => {
                const nextBoards = prev.filter(b => b.id !== id);
                if (currentBoardId === id) {
                    const nextId = nextBoards.length > 0 ? nextBoards[0].id : null;
                    if (nextId) setCurrentBoardId(nextId);
                    else window.location.reload();
                }
                return nextBoards;
            });

        } catch (e: any) {
            console.error("Delete failed:", e);
            alert("Delete failed: " + e.message);
        }
    }, [currentBoardId]);

    // Update Board ID
    const updateBoardId = useCallback(async (oldId: string, newId: string): Promise<boolean> => {
        if (!newId || newId === oldId) return false;

        try {
            // 1. Database Update
            const { error } = await supabase.from('boards').update({ id: newId }).eq('id', oldId);

            if (error) {
                console.error("Update ID DB Error:", error);
                throw error;
            }

            // 2. Local State Update
            setBoards(prev => prev.map(b => b.id === oldId ? { ...b, id: newId } : b));

            // 3. Switch Active Context if needed
            if (currentBoardId === oldId) {
                setCurrentBoardId(newId);
            }

            // alert("ID Updated Successfully!");
            return true;

        } catch (e: any) {
            console.error("Update ID failed:", e);
            alert("Update ID failed (可能是ID重复或数据库限制): " + e.message);
            return false;
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
