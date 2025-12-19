import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Board } from '../types';

export const useBoards = (
    userId: string,
    userRole: string | null,
    onBoardSwitch?: () => void
) => {
    const [boards, setBoards] = useState<Board[]>([]);
    const [currentBoardId, setCurrentBoardId] = useState<number | null>(null);

    // Fetch Boards & Subscribe to Realtime Changes
    useEffect(() => {
        let isMounted = true;

        if (!userId) {
            console.log("🔥 [useBoards] 无有效用户信息，跳过加载");
            setBoards([]);
            setCurrentBoardId(null);
            return;
        }

        const createDefaultBoard = async () => {
            if (!userId) return;
            const defaultBoard = {
                name: '档案库 01',
                user_id: userId
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

        // Initial Fetch
        const fetchBoards = async () => {
            if (!userId) {
                return;
            }

            console.log("🔥 [useBoards] 开始获取画板列表 (Numeric ID Mode)...");

            try {
                let query = supabase
                    .from('boards')
                    .select('*')
                    .order('created_at', { ascending: false });

                // If NOT admin, filter by user_id. Admins see all.
                if (userRole !== 'admin') {
                    query = query.eq('user_id', userId);
                }

                const { data, error } = await query;

                if (error) throw error;
                if (!isMounted) return;

                console.log("🔥 [useBoards] 数据库返回:", data);

                if (data && data.length > 0) {
                    setBoards(data);

                    // If no active board, set the most recent one
                    // We use the functional update pattern or just check current state safely?
                    // Inside useEffect, accessing currentBoardId directly might be stale if dep missing, 
                    // but we only run this on userId/role change.
                    // Let's just default to first one if we don't have one selected or if selected one is invalid.
                    setCurrentBoardId(prev => {
                        if (prev && data.find(b => b.id === prev)) return prev;
                        return data[0].id;
                    });
                } else {
                    // Empty DB
                    console.log("🔥 [useBoards] 列表为空，初始化默认画板...");
                    createDefaultBoard();
                }
            } catch (error: any) {
                console.error('Error fetching boards:', error);
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
                        setCurrentBoardId(curr => curr || newBoard.id);

                    } else if (payload.eventType === 'UPDATE') {
                        const updatedBoard = payload.new as Board;
                        setBoards(prev => prev.map(b => b.id === updatedBoard.id ? updatedBoard : b));
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        setBoards(prev => prev.filter(b => b.id !== deletedId));
                        setCurrentBoardId(curr => (curr === deletedId ? null : curr));
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [userId, userRole]); // Run when userId or role changes

    // Add Board
    const addBoard = useCallback(async () => {
        if (!userId) return;
        const newBoardPayload = {
            name: `New Case #${boards.length + 1}`,
            user_id: userId
        };

        try {
            const { data, error } = await supabase.from('boards').insert([newBoardPayload]).select();
            if (error) throw error;

            if (data && data.length > 0) {
                const created = data[0];
                setBoards(prev => [...prev, created]);
                setCurrentBoardId(created.id);
                if (onBoardSwitch) onBoardSwitch();
            }
        } catch (e: any) {
            console.error("Add failed:", e);
            alert(e.message);
        }
    }, [boards, onBoardSwitch, userId]);

    // Rename Board
    const renameBoard = useCallback(async (id: number, newName: string) => {
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
        await supabase.from('boards').update({ name: newName }).eq('id', id);
    }, []);

    // Delete Board
    const deleteBoard = useCallback(async (id: number) => {
        if (!window.confirm("Permanently delete this case?")) return;
        try {
            await supabase.from('notes').delete().eq('board_id', id);
            await supabase.from('connections').delete().eq('board_id', id);
            await supabase.from('boards').delete().eq('id', id);
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

    return {
        boards,
        currentBoardId,
        setCurrentBoardId,
        addBoard,
        renameBoard,
        deleteBoard
    };
};
