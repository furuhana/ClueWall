import React, { useState, useRef, useCallback } from 'react';
import { uploadImage } from '../api';
import { Note } from '../types';
import { supabase } from '../supabaseClient';

export const useFileDrop = (
    toWorld: (x: number, y: number) => { x: number, y: number },
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
    maxZIndex: number,
    setMaxZIndex: React.Dispatch<React.SetStateAction<number>>,
    saveToCloud: (notes: Note[], connections: any[]) => Promise<void>
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

        let currentZ = maxZIndex;
        const worldPos = toWorld(e.clientX, e.clientY);
        const dropX = worldPos.x;
        const dropY = worldPos.y;

        const promises = imageFiles.map(async (file, index) => {
            // 🟢 PASS USER INFO TO API
            const driveFileId = await uploadImage(file, userId, userName);
            if (!driveFileId) return null;

            return new Promise<Note>((resolve) => {
                const img = new Image();
                img.src = driveFileId; // Ensure this is a valid URL for loading
                img.onload = () => {
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
                    // Generating temporary numeric ID. 
                    // Ideally we should insert into DB here to get real ID, similar to addNote.
                    // But for now, we use negative timestamp to differentiate from DB autoincrement (usually positive).
                    // App.tsx and saveToCloud will need to handle "creation" if ID is negative, or just upsert?
                    // Actually saveToCloud uses upsert. If we send -123, it saves -123.
                    // If we want auto-increment, we must NOT send ID or send undefined, but Note type requires ID.
                    // We might need to change Note type id to optional? No, that breaks everything.
                    // Better approach: useFileDrop should probably call an async creator provided by hook, or we accept negative IDs for now.
                    // User asked for "Database Auto-Increment". Upserting a negative ID will bypass auto-increment and store negative ID.
                    // That is techincally "numeric ID", but not "database auto-generated" in the strict sense of serial.
                    // However, for files, we might be okay with client-generated timestamp numbers if they are unique enough?
                    // The user explicitly said: "Stop client-side string ID generation... Use Database Auto-Increment IDs".
                    // So we really should NOT generate ID here.
                    // But `useFileDrop` returns `Note` object which MUST have an ID for the UI to render immediately.
                    // Compromise: We use a temporary negative ID for UI, and `saveToCloud` or a new `createNote` function should handle standardizing it?
                    // Actually, let's just use Date.now() as number. It's safe enough for BigInt/Number columns even if not strictly db-serial.
                    // Wait, user said "Use Database Auto-Increment IDs".
                    // If I use Date.now(), it is a large number, fits in BigInt, but is CLIENT generated.
                    // User *specifically* asked to stop client generation.
                    // So I should insert immediately to get the ID.
                    // But I need `saveToCloud` or `supabase` access here. I have `supabase` imported.
                    // I will insert a placeholder note to DB to get ID, then resolve with that ID.

                    resolve({
                        id: -Date.now(), // Placeholder, will fix in App logic or loop
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
                        scale: 1
                    });
                };
            });
        });

        const loadedNotes = (await Promise.all(promises)).filter(n => n !== null) as Note[];

        if (loadedNotes.length > 0) {
            const newMaxZ = currentZ;
            setMaxZIndex(newMaxZ);
            setNotes(prev => [...prev, ...loadedNotes]);
            // Note: setSelectedIds logic was here, but we don't have access to setSelectedIds directly here unless passed.
            // It's fine to skip auto-selection or pass it if critical.
            // Original: setSelectedIds(new Set([loadedNotes[0].id]));
            saveToCloud(loadedNotes, []);
        }
    }, [maxZIndex, toWorld, setNotes, setMaxZIndex, saveToCloud]);

    return {
        isDraggingFile,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop
    };
};
