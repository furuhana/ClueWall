import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Board } from '../types';

export const useBoards = (
    onBoardSwitch?: () => void
) => {
    const [boards, setBoards] = useState<Board[]>([]);
    const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);

    // Fetch Boards
    useEffect(() => {
        const fetchBoards = async () => {
            const { data, error } = await supabase.from('boards').select('*').order('created_at', { ascending: true });

            if (data && data.length > 0) {
                setBoards(data);
                if (!currentBoardId) setCurrentBoardId(data[0].id);
            } else {
                // If no boards, create default
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
        };

        fetchBoards();
        // NOTE: dependency array is empty to run once on mount. 
    }, []);

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
                const next = [...prev, createdBoard];
                return next;
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
        if (!window.confirm("Are you sure? This will delete all evidence in this case!")) return;

        try {
            // Note: If 'ON DELETE CASCADE' is not set in DB, we must manually delete children
            const { error: notesError } = await supabase.from('notes').delete().eq('board_id', id);
            // Ignore notes error if they just didn't exist, but helpful to log
            if (notesError) console.warn("Notes delete warning:", notesError);

            const { error: connsError } = await supabase.from('connections').delete().eq('board_id', id);
            if (connsError) console.warn("Connections delete warning:", connsError);

            const { error } = await supabase.from('boards').delete().eq('id', id);
            if (error) throw error;

            const nextBoards = boards.filter(b => b.id !== id);
            setBoards(nextBoards);

            // If deleted board was active, switch to another one
            if (currentBoardId === id) {
                const nextId = nextBoards.length > 0 ? nextBoards[0].id : null;
                setCurrentBoardId(nextId);
            }
        } catch (e: any) {
            console.error("Delete failed:", e);
            alert("Delete failed: " + e.message);
        }
    }, [boards, currentBoardId]);

    // NEW: Update Board ID
    const updateBoardId = useCallback(async (oldId: string, newId: string) => {
        if (!newId || newId === oldId) return;

        try {
            // 1. Database Update
            // WARNING: This requires foreign key constraints to be configured with 'ON UPDATE CASCADE'
            // If not, this might fail or orphan the records.
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
