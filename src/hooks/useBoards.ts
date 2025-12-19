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
            console.log("🔥 [Init] 开始从数据库加载画板...");
            const { data, error } = await supabase.from('boards').select('*').order('created_at', { ascending: true });

            if (error) {
                console.error("🔥 [Init] 获取画板失败:", error);
                // Alert is intrusive on reload, maybe just log unless critical
                console.log("Database fetch error, check console.");
                return;
            }

            console.log("🔥 [Init] 数据库返回:", data);

            if (data && data.length > 0) {
                // Case A: Data exists
                setBoards(data);
                // Force select the first one if we don't have one selected
                setCurrentBoardId(prev => prev || data[0].id);
                console.log("🔥 [Init] 已自动选中画板:", data[0].id);
            } else {
                // Case B: Zero data -> Create Default
                console.log("🔥 [Init] 数据库为空，正在创建初始档案库...");
                const defaultBoard = {
                    id: 'main-case',
                    name: '档案库 01'
                };

                try {
                    const { data: newBoard, error: insertError } = await supabase
                        .from('boards')
                        .insert([defaultBoard])
                        .select();

                    if (insertError) {
                        console.error("🔥 [Init] 创建默认画板失败:", insertError);
                        alert("无法自动创建初始画板，请检查数据库权限 (RLS).");
                    } else if (newBoard && newBoard.length > 0) {
                        console.log("🔥 [Init] 初始画板创建成功:", newBoard[0]);
                        setBoards(newBoard);
                        setCurrentBoardId(newBoard[0].id);
                    }
                } catch (e) {
                    console.error("🔥 [Init] 严重错误:", e);
                }
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
                            const next = [...prev, newBoard];
                            return next;
                        });
                        // If no board selected, select the new one
                        setCurrentBoardId(curr => curr || newBoard.id);
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedBoard = payload.new as Board;
                        setBoards(prev => prev.map(b => b.id === updatedBoard.id ? updatedBoard : b));
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        setBoards(prev => prev.filter(b => b.id !== deletedId));
                        // If current board deleted, clear ID to trigger fail-safe or reload
                        setCurrentBoardId(curr => (curr === deletedId ? null : curr));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Fail-safe: If currentBoardId is null but we have boards, pick the first one.
    useEffect(() => {
        if (!currentBoardId && boards.length > 0) {
            console.log("🔥 [Fail-safe] 发现 ID 为空但有数据，自动选第一个");
            setCurrentBoardId(boards[0].id);
        }
    }, [currentBoardId, boards]);

    const addBoard = useCallback(async () => {
        const newId = `case-${Date.now()}`;
        const newBoardPayload = {
            id: newId,
            name: `New Case #${boards.length + 1}`
        };

        try {
            const { data, error } = await supabase.from('boards').insert([newBoardPayload]).select();

            if (error) {
                console.error("Add board error:", error);
                alert("创建失败: " + error.message);
                return;
            }

            if (data && data.length > 0) {
                const created = data[0];
                setBoards(prev => {
                    if (prev.some(b => b.id === created.id)) return prev;
                    return [...prev, created];
                });
                setCurrentBoardId(created.id);
                if (onBoardSwitch) onBoardSwitch();
            }
        } catch (e: any) {
            console.error("Add board exception:", e);
        }
    }, [boards, onBoardSwitch]);

    const renameBoard = useCallback(async (id: string, newName: string) => {
        // Optimistic
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));

        const { error } = await supabase.from('boards').update({ name: newName }).eq('id', id);
        if (error) {
            console.error("Rename failed:", error);
            // Revert or alert? Alert for now.
            alert("Rename failed in DB: " + error.message);
        }
    }, []);

    const deleteBoard = useCallback(async (id: string) => {
        if (!window.confirm("CONFIRM DELETE? This will destroy all evidence in this case.")) return;

        try {
            // Manual cascade delete because we aren't sure if DB has cascade set
            await supabase.from('notes').delete().eq('board_id', id);
            await supabase.from('connections').delete().eq('board_id', id);

            const { error } = await supabase.from('boards').delete().eq('id', id);
            if (error) throw error;

            setBoards(prev => {
                const next = prev.filter(b => b.id !== id);
                if (currentBoardId === id) {
                    if (next.length > 0) setCurrentBoardId(next[0].id);
                    else setCurrentBoardId(null); // Will likely trigger empty state or wait for new one
                }
                return next;
            });
        } catch (e: any) {
            console.error("Delete failed:", e);
            alert("Delete failed: " + e.message);
        }
    }, [currentBoardId]);

    const updateBoardId = useCallback(async (oldId: string, newId: string): Promise<boolean> => {
        if (!newId || newId === oldId) return false;

        try {
            const { error } = await supabase.from('boards').update({ id: newId }).eq('id', oldId);
            if (error) throw error;

            setBoards(prev => prev.map(b => b.id === oldId ? { ...b, id: newId } : b));
            if (currentBoardId === oldId) {
                setCurrentBoardId(newId);
            }
            return true;
        } catch (e: any) {
            console.error("Update ID failed:", e);
            alert("Update ID Failed: " + e.message);
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
