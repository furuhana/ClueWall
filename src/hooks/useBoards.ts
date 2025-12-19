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
                const defaultBoard = { name: 'Main Case' };
                // Using Supabase to generate ID
                const { data: newBoard, error: insertError } = await supabase.from('boards').insert(defaultBoard).select();
                if (newBoard && newBoard.length > 0) {
                    setBoards(newBoard);
                    setCurrentBoardId(newBoard[0].id);
                } else {
                    // Fallback logic could go here if insert fails
                }
            }
        };

        fetchBoards();
        // NOTE: dependency array is empty to run once on mount. 
        // Adding currentBoardId would cause loop if we set it inside.
    }, []);

    const addBoard = useCallback(async () => {
        const newBoardPayload = {
            name: `New Case #${boards.length + 1}`
        };

        const { data, error } = await supabase.from('boards').insert(newBoardPayload).select();

        if (data && data.length > 0) {
            const newBoard = data[0];
            setBoards(prev => {
                const next = [...prev, newBoard];
                return next;
            });
            // Immediately switch to new board
            setCurrentBoardId(newBoard.id);
            if (onBoardSwitch) onBoardSwitch();
        }
    }, [boards, onBoardSwitch]);

    const renameBoard = useCallback(async (id: string, newName: string) => {
        // Optimistic update
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));

        const { error } = await supabase.from('boards').update({ name: newName }).eq('id', id);
        if (error) {
            // Revert on error could be implemented here, but for now we assume success
            console.error("Rename failed", error);
        }
    }, []);

    const deleteBoard = useCallback(async (id: string) => {
        if (!window.confirm("Are you sure? This will delete all evidence in this case!")) return;

        // Cascade delete manually for safety
        await supabase.from('notes').delete().eq('board_id', id);
        await supabase.from('connections').delete().eq('board_id', id);

        const { error } = await supabase.from('boards').delete().eq('id', id);

        if (!error) {
            const nextBoards = boards.filter(b => b.id !== id);
            setBoards(nextBoards);

            // If deleted board was active, switch to another one
            if (currentBoardId === id) {
                const nextId = nextBoards.length > 0 ? nextBoards[0].id : null;
                setCurrentBoardId(nextId);
            }
        }
    }, [boards, currentBoardId]);

    return {
        boards,
        currentBoardId,
        setCurrentBoardId,
        addBoard,
        renameBoard,
        deleteBoard
    };
};
