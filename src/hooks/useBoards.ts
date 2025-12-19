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
        let isMounted = true;

        // Initial Fetch
        const fetchBoards = async () => {
            console.log("🔥 [useBoards] 开始获取画板列表 (Simple Mode)...");

            // PURE SELECT - No sorting to prevent 400 errors if columns missing/indexed wrong
            const { data, error } = await supabase.from('boards').select('*');

            if (error) {
                console.error("🔥 [useBoards] 致命错误 (400?):", error);
                // Don't alert immediately on refresh loops, but log heavily
                return;
            }

            if (!isMounted) return;

            console.log("🔥 [useBoards] 数据库返回:", data);

            if (data && data.length > 0) {
                // 1. Update List
                setBoards(data);

                // 2. Immediate Active Switch
                // Always pick the first valid ID from the array. 
                // This eliminates 'loading-board' state.
                const firstId = data[0].id; // e.g. "v1" or whatever is in DB
                console.log(`🔥 [useBoards] 锁定活动画板: ${firstId}`);
                setCurrentBoardId(firstId);
            } else {
                // Empty DB
                console.log("🔥 [useBoards] 列表为空，初始化默认画板...");
                createDefaultBoard();
            }
        };

        const createDefaultBoard = async () => {
            const defaultId = `case-${Date.now()}`;
            const defaultBoard = {
                id: defaultId,
                name: '档案库 01'
            };

            const { data, error } = await supabase.from('boards').insert([defaultBoard]).select();

            if (data && data.length > 0) {
                if (!isMounted) return;
                setBoards([data[0]]);
                setCurrentBoardId(data[0].id);
            } else if (error) {
                console.error("Failed to create default board:", error);
            }
        };

        fetchBoards();

        // Realtime Subscription
        const channel = supabase.channel('realtime-boards')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'boards' },
                (payload) => {
                    console.log('Realtime update:', payload);
                    if (payload.eventType === 'INSERT') {
                        const newBoard = payload.new as Board;
                        setBoards(prev => {
                            if (prev.some(b => b.id === newBoard.id)) return prev;
                            return [...prev, newBoard];
                        });
                        // Optional: Switch to new board if explicitly added? 
                        // Usually we only switch if user triggered it, but for realtime we just add to list.
                        // UNLESS we have no board selected.
                        setCurrentBoardId(curr => curr || newBoard.id);

                    } else if (payload.eventType === 'UPDATE') {
                        const updatedBoard = payload.new as Board;
                        setBoards(prev => prev.map(b => b.id === updatedBoard.id ? updatedBoard : b));

                        // Handle ID change if current board was modified
                        const oldId = payload.old?.id; // Note: payload.old only has ID if identity replica
                        if (oldId && updatedBoard.id !== oldId) {
                            setCurrentBoardId(curr => (curr === oldId ? updatedBoard.id : curr));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        setBoards(prev => prev.filter(b => b.id !== deletedId));
                        // If active board deleted
                        setCurrentBoardId(curr => (curr === deletedId ? null : curr));
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, []); // Run once on mount

    // Add Board
    const addBoard = useCallback(async () => {
        const newId = `case-${Date.now()}`;
        const newBoardPayload = {
            id: newId,
            name: `New Case #${boards.length + 1}`
        };

        try {
            const { data, error } = await supabase.from('boards').insert([newBoardPayload]).select();
            if (error) throw error;

            if (data && data.length > 0) {
                const created = data[0];
                setBoards(prev => [...prev, created]);
                setCurrentBoardId(created.id); // Switch to it
                if (onBoardSwitch) onBoardSwitch();
            }
        } catch (e: any) {
            console.error("Add failed:", e);
            alert(e.message);
        }
    }, [boards, onBoardSwitch]);

    // Rename Board
    const renameBoard = useCallback(async (id: string, newName: string) => {
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
        await supabase.from('boards').update({ name: newName }).eq('id', id);
    }, []);

    // Delete Board
    const deleteBoard = useCallback(async (id: string) => {
        if (!window.confirm("Permanently delete this case?")) return;
        try {
            await supabase.from('notes').delete().eq('board_id', id);
            await supabase.from('connections').delete().eq('board_id', id);
            await supabase.from('boards').delete().eq('id', id);
            // State update handled by Realtime usually, but optimistic is faster
            setBoards(prev => {
                const next = prev.filter(b => b.id !== id);
                if (currentBoardId === id) {
                    setCurrentBoardId(next.length > 0 ? next[0].id : null);
                }
                return next;
            });
        } catch (error) {
            console.error(error);
        }
    }, [currentBoardId]);

    // Update Board ID
    const updateBoardId = useCallback(async (oldId: string, newId: string): Promise<boolean> => {
        if (!newId || newId === oldId) return false;
        try {
            const { error } = await supabase.from('boards').update({ id: newId }).eq('id', oldId);
            if (error) throw error;

            setBoards(prev => prev.map(b => b.id === oldId ? { ...b, id: newId } : b));
            if (currentBoardId === oldId) setCurrentBoardId(newId);
            return true;
        } catch (e: any) {
            console.error("ID Update Error:", e);
            alert("ID Modification Error: " + e.message);
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
};
