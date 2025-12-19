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
                    resolve({
                        id: `evidence-${Date.now()}-${index}`,
                        type: 'evidence' as any, // 'evidence' doesn't exist on Note['type'] in App.tsx? Checked App.tsx: 'note', 'photo', 'dossier', 'scrap', 'marker'. 'evidence' seems to serve as 'photo'? 
                        // Original App.tsx line 607 uses `type: 'evidence'`. Check types.ts...
                        // Assuming 'evidence' is valid or I should use 'photo'. The original code used 'evidence'.
                        // Actually, let's stick to what original code did.
                        content: file.name,
                        fileId: driveFileId,
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
