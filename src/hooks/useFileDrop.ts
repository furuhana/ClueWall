import React, { useState, useRef, useCallback } from 'react';
import { uploadImage } from '../api';
import { Note } from '../types';
import { supabase } from '../supabaseClient';
import { mapNoteToDb, mapDbToNote } from '../utils';

export const useFileDrop = (
    toWorld: (x: number, y: number) => { x: number, y: number },
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
    maxZIndex: number,
    setMaxZIndex: React.Dispatch<React.SetStateAction<number>>,
    saveToCloud: (notes: Note[], connections: any[]) => Promise<void>,
    activeBoardId: number | undefined
) => {
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const dragCounter = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current += 1;
        if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) setIsDraggingFile(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(false);
        dragCounter.current = 0;

        if (!activeBoardId) {
            console.warn("No active board selected, cannot drop file.");
            return;
        }

        const files = Array.from(e.dataTransfer.files) as File[];
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        // 🟢 PREPARE USER INFO FROM SUPABASE
        let userId = undefined;
        let userName = undefined;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            userId = user.id;
            userName = user.email || user.user_metadata?.full_name || 'AnonymousAgent';
        }

        if (!userId) {
            alert("正在准备探员身份，请稍后拖入");
            return;
        }

        let currentZ = maxZIndex;
        const worldPos = toWorld(e.clientX, e.clientY);
        const dropX = worldPos.x;
        const dropY = worldPos.y;

        const promises = imageFiles.map(async (file, index) => {
            // 🟢 PASS USER INFO TO API
            const driveFileId = await uploadImage(file, userId, userName);
            if (!driveFileId) return null;

            return new Promise<Note>((resolve, reject) => {
                const img = new Image();
                img.src = driveFileId; // Ensure this is a valid URL for loading
                img.onload = async () => {
                    const MAX_WIDTH = 300;
                    let finalWidth = img.width;
                    let finalHeight = img.height;
                    if (finalWidth > MAX_WIDTH) {
                        const ratio = MAX_WIDTH / finalWidth;
                        finalWidth = MAX_WIDTH;
                        finalHeight = finalHeight * ratio;
                    }
                    if (finalWidth < 50) finalWidth = 50;
                    if (finalHeight < 50) finalHeight = 50;

                    currentZ++;

                    const partialNote: Partial<Note> = {
                        type: 'evidence' as any,
                        content: file.name,
                        file_id: driveFileId,
                        x: dropX - (finalWidth / 2) + (index * 20),
                        y: dropY - (finalHeight / 2) + (index * 20),
                        zIndex: currentZ,
                        rotation: (Math.random() * 10) - 5,
                        hasPin: false,
                        width: finalWidth,
                        height: finalHeight,
                        scale: 1,
                        board_id: activeBoardId,
                        user_id: userId
                    } as any;

                    const dbPayload = mapNoteToDb(partialNote);
                    console.log("Dropping File Payload:", dbPayload);

                    const { data, error } = await supabase.from('notes').insert([dbPayload]).select().single();

                    if (error) {
                        console.error("Failed to insert dropped file note:", error);
                        if ((error as any).details) console.error("Error Details:", (error as any).details);
                        if ((error as any).hint) console.error("Error Hint:", (error as any).hint);
                        reject(error);
                        return;
                    }

                    if (data) {
                        resolve(mapDbToNote(data));
                    } else {
                        reject(new Error("No data returned from insert"));
                    }
                };
                img.onerror = (err) => {
                    console.error("Failed to load image for dimensions:", err);
                    reject(err);
                }
            });
        });

        try {
            const loadedNotes = (await Promise.all(promises)).filter(n => n !== null) as Note[];

            if (loadedNotes.length > 0) {
                const newMaxZ = currentZ;
                setMaxZIndex(newMaxZ);
                setNotes(prev => [...prev, ...loadedNotes]);
                // No need to call saveToCloud as we just inserted them.
            }
        } catch (error: any) {
            console.error("Error processing dropped files:", error);
            if (error.details) console.error("Deep Details:", error.details);
            if (error.hint) console.error("Deep Hint:", error.hint);
        }
    }, [maxZIndex, toWorld, setNotes, setMaxZIndex, activeBoardId]); // Removed saveToCloud dependency as logic changed

    return {
        isDraggingFile,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop
    };
};
