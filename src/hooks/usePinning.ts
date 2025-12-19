import { useState, useRef, useCallback } from 'react';
import { Note, Connection } from '../types';
import { getNoteDimensions } from '../utils';

interface PinDragData { noteId: number; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }

export const usePinning = (
    notes: Note[],
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
    connections: Connection[],
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
    saveToCloud: (notes: Note[], connections: Connection[]) => Promise<void>,
    view: { zoom: number },
    toWorld: (x: number, y: number) => { x: number, y: number }
) => {
    const [connectingNodeId, setConnectingNodeId] = useState<number | null>(null);
    const [pinDragData, setPinDragData] = useState<PinDragData | null>(null);
    const [isPinMode, setIsPinMode] = useState<boolean>(false);
    const isPinDragRef = useRef(false);

    const handlePinMouseDown = useCallback((e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        e.preventDefault();
        const note = notes.find(n => n.id === id);
        if (!note) return;
        const { width, height } = getNoteDimensions(note);
        isPinDragRef.current = false;
        setPinDragData({ noteId: id, startX: e.clientX, startY: e.clientY, initialPinX: note.pinX ?? width / 2, initialPinY: note.pinY ?? 10, rotation: note.rotation, width, height });
    }, [notes]);

    const handlePinMove = useCallback((e: React.MouseEvent) => {
        if (pinDragData) {
            isPinDragRef.current = true;
            const screenDx = e.clientX - pinDragData.startX;
            const screenDy = e.clientY - pinDragData.startY;
            const worldDx = screenDx / view.zoom;
            const worldDy = screenDy / view.zoom;
            const rad = -(pinDragData.rotation * Math.PI) / 180;
            const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad);
            const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);
            let newPinX = pinDragData.initialPinX + localDx;
            let newPinY = pinDragData.initialPinY + localDy;
            newPinX = Math.max(0, Math.min(newPinX, pinDragData.width));
            newPinY = Math.max(0, Math.min(newPinY, pinDragData.height));
            setNotes(prev => prev.map(n => n.id === pinDragData.noteId ? { ...n, pinX: newPinX, pinY: newPinY } : n));
        }
    }, [pinDragData, view, setNotes]);

    const handlePinMouseUp = useCallback(() => {
        if (pinDragData) {
            const note = notes.find(n => n.id === pinDragData.noteId);
            if (note) saveToCloud([note], []);
        }
        setPinDragData(null);
    }, [pinDragData, notes, saveToCloud]);

    const handlePinClick = useCallback((e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (isPinDragRef.current) { isPinDragRef.current = false; return; }
        if (isPinMode) { setIsPinMode(false); setConnectingNodeId(id); return; }
        if (connectingNodeId === null) {
            setConnectingNodeId(id);
        } else {
            if (connectingNodeId !== id) {
                const nextConns = [...connections];
                const exists = nextConns.some(c => (c.sourceId === connectingNodeId && c.targetId === id) || (c.sourceId === id && c.targetId === connectingNodeId));
                if (!exists) {
                    // Connections need IDs too. Temp ID until we fully async it.
                    const newConn = { id: -Date.now(), sourceId: connectingNodeId, targetId: id, color: '#D43939' };
                    const finalConns = [...nextConns, newConn];
                    setConnections(finalConns);
                    saveToCloud(notes, finalConns);
                }
            }
            setConnectingNodeId(null);
        }
    }, [isPinDragRef, isPinMode, connectingNodeId, connections, saveToCloud, notes, setConnections]);

    const handleStartPinFromCorner = useCallback((id: number) => setIsPinMode(true), []);

    // Handling clicking on a node to create a pin
    const handleNodeClickForPin = useCallback((e: React.MouseEvent, id: number) => {
        if (!isPinMode && !connectingNodeId) return false;

        const targetNote = notes.find(n => n.id === id); if (!targetNote) return false;

        const rect = e.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx; const dy = e.clientY - cy;
        const rad = -(targetNote.rotation * Math.PI) / 180;
        const unrotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const unrotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);
        const { width: w, height: h } = getNoteDimensions(targetNote);
        const pinX = w / 2 + (unrotatedDx / view.zoom);
        const pinY = h / 2 + (unrotatedDy / view.zoom);

        const updatePin = (n: Note) => ({ ...n, hasPin: true, pinX, pinY });

        if (isPinMode) {
            const nextNotes = notes.map((n) => n.id === id ? updatePin(n) : n);
            setNotes(nextNotes);
            saveToCloud(nextNotes, connections);
            return true;
        }

        if (connectingNodeId) {
            if (connectingNodeId === id) return true;
            const nextNotes = notes.map((n) => n.id === id ? updatePin(n) : n);
            let nextConns = connections;
            const exists = connections.some(c => (c.sourceId === connectingNodeId && c.targetId === id) || (c.sourceId === id && c.targetId === connectingNodeId));
            if (!exists) { nextConns = [...connections, { id: -Date.now(), sourceId: connectingNodeId, targetId: id, color: '#D43939' }]; }
            setNotes(nextNotes);
            setConnections(nextConns);
            setConnectingNodeId(null);
            saveToCloud(nextNotes, nextConns);
            return true;
        }
        return false;
    }, [isPinMode, connectingNodeId, notes, view, connections, saveToCloud, setNotes, setConnections]);

    return {
        connectingNodeId, setConnectingNodeId,
        pinDragData, setPinDragData,
        isPinMode, setIsPinMode,
        handlePinMouseDown,
        handlePinMove,
        handlePinMouseUp,
        handlePinClick,
        handleStartPinFromCorner,
        handleNodeClickForPin
    };
};
