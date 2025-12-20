import React, { useRef, useEffect, useCallback, useState } from 'react';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';
import Login from './pages/Login/Login';
import { Note, Board } from './types';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import {
    Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2,
    StickyNote, Image as ImageIcon, Folder, FileText, ChevronRight, Archive, PlusSquare, Shield, Edit3, Settings, X, AlertTriangle, Check
} from 'lucide-react';

import { Sidebar } from './components/Sidebar';

// Hooks
import { useBoardData } from './hooks/useBoardData';
import { useCanvasView } from './hooks/useCanvasView';
import { useInteractions } from './hooks/useInteractions';
import { usePinning } from './hooks/usePinning';
import { useStealthMode } from './hooks/useStealthMode';
import { useAudio } from './hooks/useAudio';
import { useFileDrop } from './hooks/useFileDrop';
import { useBoards } from './hooks/useBoards';
import { usePresence } from './hooks/usePresence'; // 🟢 Import Hook
import { mapNoteToDb, mapDbToNote, mapDbToConnection, sanitizeNoteForInsert } from './utils';
import { CursorLayer } from './components/CursorLayer'; // 🟢 Import Component
import { PresenceBar } from './components/PresenceBar'; // 🟢 Import Component

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";

// --- Extracted Components to avoid re-creation issues ---

interface SettingsModalProps {
    isOpen: boolean;
    board: Board | null;
    onClose: () => void;
    onDelete: (id: number) => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, board, onClose, onDelete }) => {
    if (!isOpen || !board) return null;

    return (
        <div
            className="fixed inset-0 z-[20000] bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="bg-[#1a1a1a] border border-white/20 p-6 rounded-lg shadow-2xl w-96 text-gray-200 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                    <h2 className="text-xl font-bold font-handwriting text-red-500 flex items-center gap-2">
                        <Settings size={18} /> Case Configuration
                    </h2>
                    <button onClick={onClose} className="hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* 🟢 Presence Bar */}
                    <PresenceBar otherUsers={otherUsers} myUserName={myUserName} />

                    {/* Sync Feedback UI */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Current Case Name</label>
                        <div className="text-white font-mono text-lg">{board.name}</div>
                    </div>

                    {/* ID Edit Section REMOVED - Auto-increment IDs should not be edited manually */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Case ID</label>
                        <div className="text-white font-mono text-lg text-gray-400">#{board.id}</div>
                    </div>

                    {/* Delete Section */}
                    <div className="pt-2 border-t border-white/10">
                        <button
                            onClick={async () => {
                                await onDelete(board.id);
                                onClose();
                            }}
                            className="w-full border border-red-900/50 hover:bg-red-900/20 text-red-500 hover:text-red-400 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                            <Trash2 size={14} /> Delete This Case
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Internal App Component (Authenticated Game Logic) ---

interface ClueWallAppProps {
    session: Session;
    userRole: string | null;
    onSignOut: () => void;
}

const ClueWallApp: React.FC<ClueWallAppProps> = ({ session, userRole, onSignOut }) => {
    // 1. Interaction Ref for Conflict Resolution
    const interactionRef = useRef<{ draggingId: number | null; resizingId: number | null; rotatingId: number | null }>({ draggingId: null, resizingId: null, rotatingId: null });

    // 2. Boards Management
    const {
        boards,
        currentBoardId,
        setCurrentBoardId,
        addBoard,
        renameBoard,
        deleteBoard
    } = useBoards(session?.user?.id || '', userRole);
    // 3. Board Data (Board Isolation)
    // IMPORTANT: Ensure we don't pass 'loading-board' to DB hooks if schema implies bigint or checks exist.
    // However, if currentBoardId is null, useBoardData usually handles it.
    // We'll trust useBoardData to handle null, or pass a dummy UUID if strict.
    const activeBoardId = currentBoardId;

    // Diagnostic: Verify global board ID update
    useEffect(() => {
        console.log("Global activeBoardId updated to:", activeBoardId);
    }, [activeBoardId]);

    const {
        notes, setNotes, connections, setConnections, isLoading,
        maxZIndex, setMaxZIndex, saveToCloud,
        handleDeleteNote: dataDeleteNote, handleDeleteConnection, clearBoard, updateNote, syncStatus
    } = useBoardData(activeBoardId || undefined, interactionRef); // Pass undefined if null to be safe

    // 4. Canvas View
    const {
        view, setView, isPanning, toWorld,
        handleZoomIn, handleZoomOut, handleResetView, handleWheel,
        startPan, updatePan, stopPan, cancelAnimation
    } = useCanvasView();

    // 5. Pinning & Connections
    const {
        connectingNodeId, setConnectingNodeId,
        pinDragData, setPinDragData,
        isPinMode, setIsPinMode,
        handlePinMouseDown, handlePinMove, handlePinMouseUp,
        handlePinClick, handleStartPinFromCorner, handleNodeClickForPin
    } = usePinning(notes, setNotes, connections, setConnections, saveToCloud, view, toWorld);

    // 6. Interactions
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    const addNote = async (type: Note['type'], position?: { x: number, y: number }) => {
        let x: number, y: number;

        if (position) {
            x = Number(position.x);
            y = Number(position.y);
        } else {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const worldPos = toWorld(centerX, centerY);
            x = worldPos.x + (Math.random() * 100 - 50);
            y = worldPos.y + (Math.random() * 100 - 50);
        }

        let width = 256; let height = 160;
        if (type === 'photo') height = 280;
        else if (type === 'dossier') height = 224;
        else if (type === 'scrap') { width = 257; height = 50; }
        else if (type === 'marker') { width = 30; height = 30; }

        let content = 'New Clue';
        if (type === 'photo') content = 'New Evidence';
        else if (type === 'scrap') content = 'Scrap note...';
        else if (type === 'marker') { const existingMarkers = notes.filter(n => n.type === 'marker'); content = (existingMarkers.length + 1).toString(); }

        const boardIdToUse = activeBoardId;
        if (!boardIdToUse) {
            alert("Please select a case first.");
            return;
        }

        if (!session?.user?.id) {
            console.error("No user session found for addNote");
            return;
        }

        const partialNote = {
            type,
            content,
            x,
            y,
            width,
            height,
            scale: 1,
            zIndex: maxZIndex + 1,
            rotation: (Math.random() * 10) - 5,
            file_id: type === 'photo' ? '/photo_1.png' : undefined,
            hasPin: false,
            board_id: Number(boardIdToUse), // Ensure number
            user_id: session.user.id // RLS Compliance
        };

        const rawDbPayload = mapNoteToDb(partialNote);

        // 🟢 ULTRA-STRICT: Use Whitelist Sanitize
        const dbPayload = sanitizeNoteForInsert(rawDbPayload);

        // 🛡️ PARANOID SAFETY: Delete ID again just in case reference leaked
        if ('id' in dbPayload) delete (dbPayload as any).id;

        try {
            console.log("Creating Note payload (Sanitized & Checked):", JSON.stringify(dbPayload));
            // 🟢 CONFIRM NO "id" KEY IN PAYLOAD. NO MANUAL "columns" parameter.
            const { data, error } = await supabase.from('notes').insert([dbPayload]).select().single();
            if (error) {
                console.error("🚨 【数据库拒收 - 深度诊断报告】", {
                    "错误信息": error.message,
                    "具体细节": error.details,
                    "修正建议": error.hint,
                    "报错代码": error.code,
                    "Payload清单": dbPayload
                });
                throw error;
            }
            if (data) {
                const newNote = mapDbToNote(data);
                const nextNotes = [...notes, newNote];
                setMaxZIndex(prev => prev + 1);
                setNotes(nextNotes);
                setSelectedIds(new Set([newNote.id]));
                // Realtime sub will likely fire too, but duplicate check exists there.
            }
        } catch (e: any) {
            console.error("Failed to add note. Payload was:", dbPayload);
            console.error("Full Error Object:", e);
            if (e.details) console.error("Deep Details:", e.details);
            if (e.hint) console.error("Deep Hint:", e.hint);
        }
    };

    // Interactions Hook
    const {
        draggingId, setDraggingId,
        rotatingId, setRotatingId,
        resizingId, setResizingId,
        selectionBox, setSelectionBox,
        // selectedIds removed here as it is passed in
        transformStart, setTransformStart,
        ghostNote, setGhostNote,
        handleNodeMouseDown, handleRotateStart, handleResizeStart,
        handleBackgroundMouseDown: handleInteractionBackgroundMouseDown,
        handleInteractionMouseMove, handleInteractionMouseUp,
        confirmGhostCreation,
        NOTE_TYPES
    } = useInteractions(notes, setNotes, view, toWorld, saveToCloud, setMaxZIndex, maxZIndex, connections, selectedIds, setSelectedIds, addNote);

    // Sync interactionRef
    useEffect(() => {
        interactionRef.current = { draggingId, resizingId, rotatingId };
    }, [draggingId, resizingId, rotatingId]);

    // 7. Stealth Mode & Audio
    const handleResetInteractions = useCallback(() => {
        setConnectingNodeId(null);
        setIsPinMode(false);
        setSelectionBox(null);
        setDraggingId(null);
        setRotatingId(null);
        setResizingId(null);
        setSelectedIds(new Set());
    }, [setConnectingNodeId, setIsPinMode, setSelectionBox, setDraggingId, setRotatingId, setResizingId, setSelectedIds]);

    const { isUIHidden, setIsUIHidden, showHiddenModeToast } = useStealthMode(handleResetInteractions);
    const { isMusicPlaying, toggleMusic, audioRef } = useAudio();

    // 8. File Drop
    const { isDraggingFile, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, uploadStatus } = useFileDrop(toWorld, setNotes, maxZIndex, setMaxZIndex, saveToCloud, activeBoardId);

    // 9. Local State & Wrappers
    const boardRef = useRef<HTMLDivElement>(null);
    const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    // Sidebar State
    const [showSidebar, setShowSidebar] = useState(false);

    // NEW: Board Settings UI State
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsTargetBoard, setSettingsTargetBoard] = useState<Board | null>(null);

    // 🟢 Presence Hook
    const [userName] = useState(() => 'Agent-' + Math.floor(Math.random() * 1000));
    const { otherUsers, broadcastMouse } = usePresence(activeBoardId, userName);

    const handleMouseMoveWrapper = (e: React.MouseEvent) => {
        const { x: worldX, y: worldY } = toWorld(e.clientX, e.clientY);
        broadcastMouse(worldX, worldY);

        // Update local mouse pos for other logic
        setMousePos({ x: e.clientX, y: e.clientY });

        // Call original logic if needed (handled by logic below usually)
        handleDragMove(e);
        handlePanMove(e);
    };

    const handleDeleteNoteWrapper = (id: number) => {
        if (connectingNodeId === id) setConnectingNodeId(null);
        dataDeleteNote(id);
    };



    // Global Key Handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (ghostNote) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + 1) % NOTE_TYPES.length } : null);
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex - 1 + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
                    return;
                }
                if (e.key === 'Enter') {
                    confirmGhostCreation();
                    return;
                }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (editingNodeId || isSettingsModalOpen) return; // Disable delete during modal
                if (connectingNodeId) {
                    const nextNotes = notes.map(n => n.id === connectingNodeId ? { ...n, hasPin: false } : n);
                    const nextConns = connections.filter(c => c.sourceId !== connectingNodeId && c.targetId !== connectingNodeId);
                    setNotes(nextNotes);
                    setConnections(nextConns);
                    setConnectingNodeId(null);
                    setSelectedIds(new Set());
                    const changedNote = nextNotes.find(n => n.id === connectingNodeId);
                    if (changedNote) saveToCloud([changedNote], []);
                    const deletedConns = connections.filter(c => c.sourceId === connectingNodeId || c.targetId === connectingNodeId);
                    deletedConns.forEach(c => handleDeleteConnection(c.id));
                    return;
                }
                if (selectedIds.size > 0) {
                    const idsArray = Array.from(selectedIds);
                    idsArray.forEach(id => handleDeleteNoteWrapper(id));
                    setSelectedIds(new Set());
                }
            }
            if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsSpacePressed(false);
                stopPan();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [ghostNote, editingNodeId, connectingNodeId, selectedIds, notes, connections, dataDeleteNote, handleDeleteConnection, setNotes, setConnections, setConnectingNodeId, setSelectedIds, saveToCloud, confirmGhostCreation, stopPan, NOTE_TYPES, isSettingsModalOpen]);

    // Input Handlers
    const handleMainWheel = (e: React.WheelEvent) => {
        if (editingNodeId || isSettingsModalOpen) return;
        if (ghostNote) {
            const direction = e.deltaY > 0 ? 1 : -1;
            setGhostNote(prev => {
                if (!prev) return null;
                const nextIndex = (prev.typeIndex + direction + NOTE_TYPES.length) % NOTE_TYPES.length;
                return { ...prev, typeIndex: nextIndex };
            });
            return;
        }
        handleWheel(e, ghostNote);
    };

    const handleMainMouseDown = (e: React.MouseEvent) => {
        handleInteractionBackgroundMouseDown(e, isSpacePressed, confirmGhostCreation);
        if (e.button === 1 || isSpacePressed) {
            e.preventDefault();
            startPan(e.clientX, e.clientY);
        }
        if (!isPanning && !selectionBox && e.target === boardRef.current && !ghostNote) {
            setConnectingNodeId(null);
            setIsPinMode(false);
        }
    };

    const handleMainMouseMove = (e: React.MouseEvent) => {
        if (isPanning) updatePan(e.clientX, e.clientY);
        else if (pinDragData) handlePinMove(e);
        else handleInteractionMouseMove(e);
        if (connectingNodeId) {
            const worldMouse = toWorld(e.clientX, e.clientY);
            setMousePos({ x: worldMouse.x, y: worldMouse.y });
        }
    };

    const handleMainMouseUp = () => {
        stopPan();
        handleInteractionMouseUp();
        handlePinMouseUp();
    };

    useEffect(() => {
        const globalUp = () => handleMainMouseUp();
        window.addEventListener('mouseup', globalUp);
        return () => window.removeEventListener('mouseup', globalUp);
    }, [handleMainMouseUp]);

    const handleDoubleClick = (id: number) => {
        if (!isPinMode && !connectingNodeId) setEditingNodeId(id);
    };

    const handleBackgroundDoubleClick = (e: React.MouseEvent) => {
        if (e.target === boardRef.current && !isPanning && !draggingId) {
            const worldPos = toWorld(e.clientX, e.clientY);
            setGhostNote({ x: worldPos.x, y: worldPos.y, typeIndex: 0 });
        }
    };

    const handleUpdateNodeSize = (id: number, width: number, height: number) => {
        if (resizingId === id) return;
        setNotes(prev => prev.map(n => n.id === id ? { ...n, width, height } : n));
    };

    const handleNodeMouseDownMsg = (e: React.MouseEvent, id: number) => {
        const wasPinClick = handleNodeClickForPin(e, id);
        if (wasPinClick) return;
        handleNodeMouseDown(e, id, isSpacePressed, isPinMode, connectingNodeId);
    };

    return (
        <div
            ref={boardRef}
            className={`w-screen h-screen relative overflow-hidden select-none ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            style={{
                backgroundImage: `url("${GRID_URL}"), linear-gradient(180deg, #A38261 22.65%, #977049 100%)`,
                backgroundPosition: `${view.x}px ${view.y}px, 0 0`,
                backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px, 100% 100%`,
                backgroundRepeat: 'repeat, no-repeat',
                backgroundColor: '#A38261'
            }}
            onWheel={handleMainWheel}
            onMouseDown={handleMainMouseDown}
            onMouseMove={handleMouseMoveWrapper}
            onDoubleClick={handleBackgroundDoubleClick}
            onDrop={handleDrop}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
        >
            <style>{`.animate-dash { stroke-dasharray: 8 4 !important; }`}</style>
            <audio ref={audioRef} src="/home_bgm.mp3" loop autoPlay />

            {isLoading && <div className="absolute bottom-4 left-4 z-[12000] flex items-center gap-3 bg-black/70 backdrop-blur-md text-white/90 px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-none"><Loader2 className="animate-spin text-yellow-400" size={16} /><span className="font-mono text-xs tracking-wider">SYNCING...</span></div>}
            {!isLoading && (
                <div className="absolute bottom-4 left-4 z-[12000] flex flex-col gap-2 pointer-events-none select-none font-sans">
                    {/* 1. 文件上传状态 (优先级高，有上传时显示) */}
                    {uploadStatus === 'uploading' && (
                        <div className="flex items-center gap-2 bg-blue-600/90 text-white px-3 py-1.5 rounded-md shadow-lg backdrop-blur animate-in slide-in-from-bottom-2">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-xs font-bold tracking-wider">正在上传...</span>
                        </div>
                    )}
                    {uploadStatus === 'success' && (
                        <div className="flex items-center gap-2 bg-green-600/90 text-white px-3 py-1.5 rounded-md shadow-lg backdrop-blur animate-in fade-in zoom-in duration-300">
                            <Check size={16} strokeWidth={3} />
                            <span className="text-xs font-bold tracking-wider">上传完成</span>
                        </div>
                    )}
                    {uploadStatus === 'error' && (
                        <div className="flex items-center gap-2 bg-red-600/90 text-white px-3 py-1.5 rounded-md shadow-lg backdrop-blur animate-pulse">
                            <AlertTriangle size={16} />
                            <span className="text-xs font-bold tracking-wider">上传失败</span>
                        </div>
                    )}
                    {/* 2. 数据库同步状态 (移动/缩放时显示) */}
                    <div className="flex items-center gap-3 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 transition-all">
                        {/* 基础连接点 (常驻) */}
                        <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${syncStatus === 'error' ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`} />

                        {/* 文字状态反馈 */}
                        <div className="flex items-center">
                            {syncStatus === 'idle' && (
                                <span className="text-[10px] text-white/50 tracking-widest">安全连接就绪</span>
                            )}

                            {syncStatus === 'success' && (
                                <div className="flex items-center gap-1.5 text-green-400 animate-in fade-in slide-in-from-left-1">
                                    <Check size={12} strokeWidth={3} />
                                    <span className="text-[10px] font-bold tracking-widest">已保存</span>
                                </div>
                            )}

                            {syncStatus === 'error' && (
                                <div className="flex items-center gap-1.5 text-red-400 animate-pulse">
                                    <AlertTriangle size={12} />
                                    <span className="text-[10px] font-bold tracking-widest">同步失败</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full backdrop-blur-md border border-white/10 transition-opacity duration-500 pointer-events-none z-[13000] ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>
                <span className="font-mono text-xs">PRESS ESC TO SHOW UI</span>
            </div>

            <SettingsModal
                isOpen={isSettingsModalOpen}
                board={settingsTargetBoard}
                onClose={() => setIsSettingsModalOpen(false)}
                onDelete={deleteBoard}
            />

            {!isUIHidden && (
                <div
                    className="absolute top-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-auto cursor-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <Sidebar
                        onAddNote={addNote}
                        onClearBoard={clearBoard}
                        isPinMode={isPinMode}
                        onTogglePinMode={() => setIsPinMode(!isPinMode)}
                        boards={boards}
                        activeBoardId={currentBoardId}
                        onSelectBoard={setCurrentBoardId}
                        onAddBoard={addBoard}
                        onRenameBoard={renameBoard}
                        onDeleteBoard={deleteBoard}
                        onOpenSettings={(board) => {
                            setSettingsTargetBoard(board);
                            setIsSettingsModalOpen(true);
                        }}
                        onSignOut={onSignOut}
                        userRole={userRole}
                        currentUserId={session.user.id}
                    />
                </div>
            )}

            {!isUIHidden && <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto cursor-auto"><div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-float"><button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-t-lg transition-colors"><Plus size={20} /></button><div className="text-xs font-mono py-1 w-12 text-center border-y border-white/10 select-none">{Math.round(view.zoom * 100)}%</div><button onClick={handleZoomOut} className="p-2 hover:bg-white/10 border-b border-white/10 transition-colors"><Minus size={20} /></button><button onClick={toggleMusic} className="p-2 hover:bg-white/10 rounded-b-lg transition-colors" title={isMusicPlaying ? "Mute Music" : "Play Music"}>{isMusicPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}</button></div><div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-float"><button onClick={handleResetView} className="p-2 hover:bg-white/10 rounded-t-lg border-b border-white/10 transition-colors" title="Reset View"><LocateFixed size={20} /></button><button onClick={() => { setIsUIHidden(true); }} className="p-2 hover:bg-white/10 rounded-b-lg transition-colors" title="Hide UI"><Maximize size={20} /></button></div></div>}

            {connectingNodeId && !isUIHidden && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-red-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce font-bold pointer-events-none">Connecting Evidence...</div>}
            {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce"><UploadCloud size={64} className="text-blue-400" /><h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2></div></div>}

            {selectionBox && (
                <div style={{ position: 'absolute', left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY), backgroundColor: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', zIndex: 9999, pointerEvents: 'none' }} />
            )}

            <div className="absolute top-0 left-0 w-0 h-0 overflow-visible pointer-events-none" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
                {notes.map((note) => (
                    <DetectiveNode
                        key={note.id}
                        note={note}
                        onMouseDown={(e) => handleNodeMouseDownMsg(e, note.id)}
                        onDoubleClick={handleDoubleClick}
                        isConnecting={!!connectingNodeId}
                        isSelectedForConnection={connectingNodeId === note.id}
                        isPinMode={isPinMode}
                        isSelected={selectedIds.has(note.id)}
                        isMultiSelected={selectedIds.size > 1}
                        onDelete={() => handleDeleteNoteWrapper(note.id)}
                        onStartPin={() => handleStartPinFromCorner(note.id)}
                        onResize={handleUpdateNodeSize}
                        onRotateStart={(e) => handleRotateStart(e, note.id)}
                        onResizeStart={(e, mode) => handleResizeStart(e, note.id, mode)}
                    />
                ))}
                <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} onDeleteConnection={handleDeleteConnection} onPinClick={handlePinClick} isPinMode={isPinMode} onConnectionColorChange={(id, color) => { const nextConns = connections.map(c => c.id === id ? { ...c, color } : c); setConnections(nextConns); saveToCloud(notes, nextConns); }} onPinMouseDown={handlePinMouseDown} />

                {ghostNote && (() => {
                    const currentType = NOTE_TYPES[ghostNote.typeIndex];
                    const previewStyles: Record<string, { color: string, icon: React.ReactNode }> = {
                        note: { color: 'border-yellow-500 bg-yellow-500/20 text-yellow-500', icon: <StickyNote size={48} /> },
                        photo: { color: 'border-gray-400 bg-gray-500/20 text-gray-400', icon: <ImageIcon size={48} /> },
                        dossier: { color: 'border-orange-600 bg-orange-600/20 text-orange-600', icon: <Folder size={48} /> },
                        scrap: { color: 'border-stone-400 bg-stone-400/20 text-stone-400', icon: <FileText size={48} /> },
                        marker: { color: 'border-blue-500 bg-blue-500/20 text-blue-500', icon: <MapPin size={48} /> },
                    };
                    const style = previewStyles[currentType] || previewStyles.note;

                    return (
                        <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000, pointerEvents: 'none' }}>
                            <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-200">
                                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-2xl backdrop-blur-sm transition-all duration-300 ${style.color}`}>
                                    {style.icon}
                                </div>
                                <div className={`mt-4 px-4 py-1 rounded-full font-bold uppercase tracking-widest text-sm border bg-black/80 backdrop-blur-md transition-colors duration-300 ${style.color.replace('bg-', 'border-').replace('/20', '/50')}`}>
                                    {currentType}
                                </div>
                                <div className="mt-2 text-white/50 text-[10px] font-mono flex items-center gap-1">
                                    <MousePointer2 size={10} /> SCROLL / ARROWS
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {draggingId && selectedIds.size <= 1 && (() => { const n = notes.find(i => i.id === draggingId); if (!n) return null; return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 256 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-xs font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">X: {Math.round(n.x)}, Y: {Math.round(n.y)}</div></div> })()}
                {rotatingId && (() => { const n = notes.find(i => i.id === rotatingId); if (!n) return null; return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 256 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-xs font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">{Math.round(n.rotation)}°</div></div> })()}
                {resizingId && transformStart && (() => {
                    const n = notes.find(i => i.id === resizingId); if (!n) return null;
                    const isTextType = ['note', 'dossier', 'scrap'].includes(n.type);
                    let text = '';
                    if (transformStart.resizeMode === 'CORNER' && isTextType) text = `${Math.round((n.scale || 1) * 100)}%`;
                    else text = `W: ${Math.round(n.width || 0)} H: ${Math.round(n.height || 0)}`;
                    return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 256 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-xs font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">{text}</div></div>
                })()}
                {pinDragData && (() => {
                    const n = notes.find(i => i.id === pinDragData.noteId);
                    if (!n) return null;
                    return (
                        <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 256 }} className="flex justify-center z-[99999]">
                            <div className="bg-black/80 text-white text-xs font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">
                                Pin X: {Math.round(n.pinX ?? 0)}, Pin Y: {Math.round(n.pinY ?? 0)}
                            </div>
                        </div>
                    );
                })()}
            </div>
            {editingNodeId && notes.find(n => n.id === editingNodeId) && <EditModal note={notes.find(n => n.id === editingNodeId)!} onSave={(note) => { updateNote(note); setEditingNodeId(null); }} onClose={() => setEditingNodeId(null)} />}
        </div>
    );
};

// --- Main App Entry: Auth \u0026 Session Managment ---

const App: React.FC = () => {
    // 0. Auth \u0026 Session State
    const [session, setSession] = useState<Session | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const [isCheckingProfile, setIsCheckingProfile] = useState(false);
    const [loginMessage, setLoginMessage] = useState<string | null>(null);

    // Cache verified user IDs to prevent re-fetching on window focus
    const verifiedUserIds = useRef<Set<string>>(new Set());

    // Strict Profile Verification Logic
    const verifyProfileStrict = async (userId: string) => {
        // Optimization: If already verified, skip blocking UI
        if (verifiedUserIds.current.has(userId)) {
            console.log("✅ Profile cached, skipping strict check.");
            setIsCheckingProfile(false); // Ensure loader is off
            return;
        }

        setIsCheckingProfile(true);
        try {
            // 1. Check if profile exists
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error("Error checking profile:", fetchError);
                // On technical error, we might want to retry or just guard.
                // For safety, assume failure if error is not "row not found".
            }

            if (!profile) {
                // ANOMALY DETECTED: User exists in Auth but not in Profiles.
                console.error("⛔ Security Alert: User has no profile record.");
                setLoginMessage("AGENT STATUS: UNAUTHORIZED. 请联系管理员激活档案。");
                await supabase.auth.signOut();
                setSession(null);
                verifiedUserIds.current.delete(userId); // Ensure not cached
                return;
            }

            console.log("🔥 Profile verified:", profile);

            // 2. Check Role Initialization
            if (!profile.role) {
                // Role is empty, meaning initialization incomplete (or pending approval logic?)
                // User requirement: "如果 profiles 表中的 role 为空... 显示加载动画"
                // So we keep isCheckingProfile = true.
                console.warn("⚠️ Profile exists but role is missing. Waiting for initialization...");
                return;
            }

            // Valid Profile & Role
            setUserRole(profile.role);
            verifiedUserIds.current.add(userId); // Cache success
            setIsCheckingProfile(false);

        } catch (e) {
            console.error("Profile check failed critical:", e);
            alert("System Error during Profile Verification.");
            await supabase.auth.signOut();
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUserRole(null);
        setIsCheckingProfile(false);
        setLoginMessage(null);
        verifiedUserIds.current.clear(); // Clear cache on logout
    };

    useEffect(() => {
        // Initial Session Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setIsLoadingAuth(false);
            if (session) {
                verifyProfileStrict(session.user.id);
            }
        });

        // Auth State Listener
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setIsLoadingAuth(false);
            if (session) {
                verifyProfileStrict(session.user.id);
            } else {
                setUserRole(null);
                setIsCheckingProfile(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Render Logic Gating
    if (isLoadingAuth) {
        return <div className="w-screen h-screen bg-black text-white flex items-center justify-center font-mono animate-pulse">Initializing Secure Connection...</div>;
    }

    if (!session) {
        return <Login loginMessage={loginMessage} />;
    }

    if (isCheckingProfile) {
        return <div className="w-screen h-screen bg-black text-white flex items-center justify-center font-mono flex-col gap-4">
            <Loader2 className="animate-spin text-yellow-500" size={48} />
            <div className="text-sm tracking-widest opacity-80 animate-pulse">Initializing Agent Profile...</div>
        </div>;
    }

    // Only render the main app if session is valid AND profile checked. 
    return <ClueWallApp session={session} userRole={userRole} onSignOut={handleSignOut} />;
};

export default App;