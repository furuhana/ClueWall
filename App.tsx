import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection, DragOffset } from './types';
import { INITIAL_NOTES, INITIAL_CONNECTIONS } from './constants';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX } from 'lucide-react';

const CORK_URL = "data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm20 20h20v20H20V20zM0 20h20v20H0V20zM20 0h20v20H20V0z' fill='%235c3a1e' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E";

type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';

interface TransformStartData {
    mouseX: number;
    mouseY: number;
    initialRotation: number;
    initialWidth: number;
    initialHeight: number;
    initialX: number;
    initialY: number;
    initialScale: number;
    resizeMode?: ResizeMode;
}

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  
  // --- Viewport State (Pan & Zoom) ---
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // State for dragging nodes
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [maxZIndex, setMaxZIndex] = useState<number>(10);

  // State for selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // State for Transforming (Rotate/Resize)
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [transformStart, setTransformStart] = useState<TransformStartData | null>(null);

  // State for connecting
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // State for editing
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // State for Tools
  const [isPinMode, setIsPinMode] = useState<boolean>(false);

  // State for File Dragging
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  // State for Music
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Refs
  const boardRef = useRef<HTMLDivElement>(null);

  // --- Helpers: Coordinate System ---
  const toWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - view.x) / view.zoom,
      y: (screenY - view.y) / view.zoom,
    };
  }, [view]);

  // --- Synchronize Dimensions ---
  const handleUpdateNodeSize = (id: string, width: number, height: number) => {
      // Prevent loop if we are currently resizing via user interaction
      if (resizingId === id) return;

      setNotes(prev => prev.map(n => {
          if (n.id === id) {
              // Only update if dimensions differ significantly
              if (Math.abs((n.width || 0) - width) > 1 || Math.abs((n.height || 0) - height) > 1) {
                  return { ...n, width, height };
              }
          }
          return n;
      }));
  };

  // --- Global Key Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) {
        if (e.key === 'Escape') setEditingNodeId(null);
        return;
      }

      if (e.key === 'Escape') {
        setConnectingNodeId(null);
        setSelectedNodeId(null);
        setIsPinMode(false);
        setEditingNodeId(null);
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
         if (connectingNodeId) {
             setNotes((prev) => 
               prev.map((n) => (n.id === connectingNodeId ? { ...n, hasPin: false } : n))
             );
             setConnections((prev) => prev.filter(c => c.sourceId !== connectingNodeId && c.targetId !== connectingNodeId));
             setConnectingNodeId(null);
         } else if (selectedNodeId) {
             handleDeleteNote(selectedNodeId);
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectingNodeId, editingNodeId, selectedNodeId]);

  // --- Music Handler ---
  useEffect(() => {
    // Attempt auto-play on mount
    if (audioRef.current) {
        audioRef.current.volume = 0.5;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => setIsMusicPlaying(true))
                .catch((e) => {
                    console.warn("Autoplay prevented by browser:", e);
                    setIsMusicPlaying(false);
                });
        }
    }
  }, []);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    
    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      audioRef.current.volume = 0.5;
      audioRef.current.play().then(() => {
        setIsMusicPlaying(true);
      }).catch(e => {
        console.error("Audio playback failed (interaction required):", e);
      });
    }
  };

  // --- Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    if (editingNodeId) return;
    
    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 3.0;
    const ZOOM_SENSITIVITY = 0.001;

    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newZoom = Math.min(Math.max(MIN_ZOOM, view.zoom + delta), MAX_ZOOM);

    const worldMouse = toWorld(e.clientX, e.clientY);
    const newX = e.clientX - worldMouse.x * newZoom;
    const newY = e.clientY - worldMouse.y * newZoom;

    setView({
      x: newX,
      y: newY,
      zoom: newZoom
    });
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
        if (e.button === 1) e.preventDefault();
        setIsPanning(true);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  // --- TRANSFORM HANDLERS ---
  const handleRotateStart = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      const note = notes.find(n => n.id === id);
      if(!note) return;

      setRotatingId(id);
      setTransformStart({
          mouseX: e.clientX,
          mouseY: e.clientY,
          initialRotation: note.rotation,
          initialWidth: 0,
          initialHeight: 0,
          initialX: 0,
          initialY: 0,
          initialScale: 1
      });
  };

  const handleResizeStart = (e: React.MouseEvent, id: string, mode: ResizeMode) => {
      e.stopPropagation();
      e.preventDefault();
      const note = notes.find(n => n.id === id);
      if(!note) return;

      const dims = getNoteDimensions(note);

      setResizingId(id);
      setTransformStart({
          mouseX: e.clientX,
          mouseY: e.clientY,
          initialRotation: note.rotation,
          initialWidth: dims.width,
          initialHeight: dims.height,
          initialX: note.x,
          initialY: note.y,
          initialScale: note.scale || 1,
          resizeMode: mode
      });
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) return;
    e.stopPropagation();
    const targetNote = notes.find(n => n.id === id);
    if (!targetNote) return;

    if (!connectingNodeId && !isPinMode) {
      setSelectedNodeId(id);
    }

    const worldMouse = toWorld(e.clientX, e.clientY);

    if (isPinMode || connectingNodeId) {
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const rad = -(targetNote.rotation * Math.PI) / 180;
        const unrotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const unrotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);
        const { width: w, height: h } = getNoteDimensions(targetNote);
        const pinX = w / 2 + (unrotatedDx / view.zoom);
        const pinY = h / 2 + (unrotatedDy / view.zoom);

        const updatePin = (n: Note) => ({ ...n, hasPin: true, pinX, pinY });

        if (isPinMode) {
            setNotes((prev) => prev.map((n) => n.id === id ? updatePin(n) : n));
            return;
        }

        if (connectingNodeId) {
            if (connectingNodeId === id) return;
            setNotes((prev) => prev.map((n) => n.id === id ? updatePin(n) : n));
            setConnections((prev) => {
                const exists = prev.some(c => (c.sourceId === connectingNodeId && c.targetId === id) || (c.sourceId === id && c.targetId === connectingNodeId));
                return exists ? prev : [...prev, { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#d93025' }];
            });
            setConnectingNodeId(null);
            return;
        }
    }

    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, zIndex: newZ } : n)));
    setDraggingId(id);
    setDragOffset({
      x: worldMouse.x - targetNote.x,
      y: worldMouse.y - targetNote.y,
    });
  };

  // --- MAIN MOUSE MOVE ---
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 1. Panning
    if (isPanning && lastMousePosRef.current) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    // 2. Rotating
    if (rotatingId && transformStart) {
        const deltaX = e.clientX - transformStart.mouseX;
        const newRotation = transformStart.initialRotation - (deltaX * 0.5);
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: newRotation } : n));
        return;
    }

    // 3. Resizing
    if (resizingId && transformStart) {
        const note = notes.find(n => n.id === resizingId);
        if(!note) return;

        const isTextType = ['note', 'dossier', 'scrap'].includes(note.type);
        const mode = transformStart.resizeMode;

        // Calculate Deltas in Local Space
        const screenDx = e.clientX - transformStart.mouseX;
        const screenDy = e.clientY - transformStart.mouseY;
        const worldDx = screenDx / view.zoom;
        const worldDy = screenDy / view.zoom;

        const rad = -(transformStart.initialRotation * Math.PI) / 180;
        const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad);
        const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);

        // --- CASE A: Corner Resizing (Proportional) ---
        // Only apply proportional scale logic if strictly using the Corner Handle.
        if (mode === 'CORNER') {
            const aspectRatio = transformStart.initialWidth / transformStart.initialHeight;
            
            // For Corner Scale: Drag Left (-x) grows. Drag Down (+y) grows.
            const wChangeFromX = -localDx;
            const wChangeFromY = localDy * aspectRatio;
            const avgWidthChange = (wChangeFromX + wChangeFromY) / 2;

            // Base calculation
            let newWidth = Math.max(50, transformStart.initialWidth + avgWidthChange);
            
            // --- CONSTRAINT LOGIC ---
            let newScale: number | undefined = undefined;

            if (isTextType) {
               const baseWidth = transformStart.initialWidth / transformStart.initialScale;
               let calculatedScale = newWidth / baseWidth;
               
               // Limit Scale: Max 300% (3.0), Min 50% (0.5)
               if (calculatedScale > 3) calculatedScale = 3;
               if (calculatedScale < 0.5) calculatedScale = 0.5;
               
               newScale = calculatedScale;
               // Recalculate width based on clamped scale to stay in sync
               newWidth = baseWidth * newScale;
            } else {
               if (newWidth > transformStart.initialWidth * 3) {
                   newWidth = transformStart.initialWidth * 3;
               }
            }

            let newHeight = newWidth / aspectRatio;

            // Center Compensation (Scale from Center)
            const widthChange = newWidth - transformStart.initialWidth;
            const heightChange = newHeight - transformStart.initialHeight;

            setNotes(prev => prev.map(n => {
                if (n.id === resizingId) {
                    return { 
                        ...n, 
                        width: newWidth, 
                        height: newHeight,
                        scale: isTextType ? newScale : undefined,
                        x: transformStart.initialX - (widthChange / 2),
                        y: transformStart.initialY - (heightChange / 2)
                    };
                }
                return n;
            }));
        } 
        
        // --- CASE B: Independent Edge Resizing (Sides) ---
        // Applies to ALL types (Text & Images). Images will stretch/crop visually.
        else {
             let newWidth = transformStart.initialWidth;
             let newHeight = transformStart.initialHeight;
             let newX = transformStart.initialX;
             let newY = transformStart.initialY;

             const MIN_W = isTextType ? 100 : 50;
             
             // Dynamic Height Limit based on Type
             let MIN_H = 50;
             if (note.type === 'dossier') {
                 MIN_H = 220;
             } else if (note.type === 'note') {
                 MIN_H = 160;
             } else if (note.type === 'scrap') {
                 MIN_H = 80;
             }

             if (mode === 'LEFT') {
                // Drag Left: x decreases, width increases. Right side pinned.
                // Logic includes Pushing: If width clamps, X keeps moving, effectively moving the whole object.
                const rawWidth = transformStart.initialWidth - localDx;
                newWidth = Math.max(MIN_W, rawWidth);
                newX = transformStart.initialX + localDx;

             } else if (mode === 'RIGHT') {
                // Drag Right: width increases. Left side pinned.
                // Added Pushing logic: If width clamps at minimum, X shifts to simulate right edge stopping but mouse pushing left edge.
                const rawWidth = transformStart.initialWidth + localDx;
                newWidth = Math.max(MIN_W, rawWidth);
                
                if (rawWidth < MIN_W) {
                   // Push the object from the right
                   newX = (transformStart.initialX + transformStart.initialWidth + localDx) - MIN_W;
                } else {
                   newX = transformStart.initialX;
                }

             } else if (mode === 'TOP') {
                // Drag Top: height increases. Bottom side pinned.
                // Logic includes Pushing: If height clamps, Y keeps moving.
                const rawHeight = transformStart.initialHeight - localDy;
                newHeight = Math.max(MIN_H, rawHeight);
                newY = transformStart.initialY + localDy;

             } else if (mode === 'BOTTOM') {
                // Drag Bottom: height increases. Top side pinned.
                // Added Pushing logic.
                const rawHeight = transformStart.initialHeight + localDy;
                newHeight = Math.max(MIN_H, rawHeight);

                if (rawHeight < MIN_H) {
                   // Push the object from the bottom
                   newY = (transformStart.initialY + transformStart.initialHeight + localDy) - MIN_H;
                } else {
                   newY = transformStart.initialY;
                }
             }

             setNotes(prev => prev.map(n => n.id === resizingId ? { 
                 ...n, 
                 width: newWidth,
                 height: newHeight,
                 x: newX,
                 y: newY
             } : n));
        }
        return;
    }

    const worldMouse = toWorld(e.clientX, e.clientY);

    if (connectingNodeId) {
         setMousePos({ x: worldMouse.x, y: worldMouse.y });
    }

    if (draggingId) {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === draggingId) {
            return {
              ...n,
              x: worldMouse.x - dragOffset.x,
              y: worldMouse.y - dragOffset.y,
            };
          }
          return n;
        })
      );
    }
  }, [isPanning, draggingId, dragOffset, connectingNodeId, view, toWorld, rotatingId, resizingId, transformStart]);

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingId(null);
    setRotatingId(null);
    setResizingId(null);
    setTransformStart(null);
    lastMousePosRef.current = null;
  };

  const handleZoomIn = () => {
      const newZoom = Math.min(view.zoom + 0.2, 3.0);
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const worldCenter = toWorld(centerX, centerY);
      const newX = centerX - worldCenter.x * newZoom;
      const newY = centerY - worldCenter.y * newZoom;
      setView({ x: newX, y: newY, zoom: newZoom });
  };
  const handleZoomOut = () => {
      const newZoom = Math.max(view.zoom - 0.2, 0.1);
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const worldCenter = toWorld(centerX, centerY);
      const newX = centerX - worldCenter.x * newZoom;
      const newY = centerY - worldCenter.y * newZoom;
      setView({ x: newX, y: newY, zoom: newZoom });
  };
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (!isPanning && (e.target === boardRef.current)) {
        setConnectingNodeId(null);
        setSelectedNodeId(null);
        setIsPinMode(false);
    }
  };
  const handlePinClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isPinMode) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, hasPin: false } : n)));
      setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
      return; 
    }
    if (connectingNodeId === null) {
      setConnectingNodeId(id);
    } else {
      if (connectingNodeId !== id) {
        setConnections((prev) => {
            const exists = prev.some(c => (c.sourceId === connectingNodeId && c.targetId === id) || (c.sourceId === id && c.targetId === connectingNodeId));
            return exists ? prev : [...prev, { id: `c-${Date.now()}-${Math.random()}`, sourceId: connectingNodeId, targetId: id, color: '#d93025' }];
        });
      }
      setConnectingNodeId(null);
    }
  };
  const handleDeleteConnection = (id: string) => setConnections(prev => prev.filter(c => c.id !== id));
  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    setSelectedNodeId(null);
  };
  const handleStartPinFromCorner = (id: string) => setIsPinMode(true);
  const addNote = (type: Note['type']) => {
     const centerX = window.innerWidth / 2;
     const centerY = window.innerHeight / 2;
     const worldPos = toWorld(centerX, centerY);
     const x = worldPos.x + (Math.random() * 100 - 50);
     const y = worldPos.y + (Math.random() * 100 - 50);
     const id = `new-${Date.now()}`;
     const newNote: Note = {
        id, type,
        content: type === 'photo' ? 'New Evidence' : (type === 'scrap' ? 'Scrap note...' : 'New Clue'),
        title: type === 'dossier' ? 'TOP SECRET' : undefined,
        subtitle: type === 'dossier' ? 'CASE FILE' : undefined,
        x, y,
        zIndex: maxZIndex + 1,
        rotation: (Math.random() * 10) - 5,
        fileId: type === 'photo' ? '/photo_1.png' : undefined,
        hasPin: false,
        scale: 1,
     };
     setMaxZIndex(prev => prev + 1);
     setNotes(prev => [...prev, newNote]);
     setSelectedNodeId(id);
  };
  const clearBoard = () => { if(window.confirm("Burn all evidence?")) { setNotes([]); setConnections([]); } };
  const handleDoubleClick = (id: string) => { if (!isPinMode && !connectingNodeId) setEditingNodeId(id); };
  const handleSaveNote = (updatedNote: Note) => { setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n)); setEditingNodeId(null); };
  const getEditingNote = () => notes.find(n => n.id === editingNodeId);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current += 1; if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDraggingFile(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files) as File[];
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let currentZ = maxZIndex;
    const worldPos = toWorld(e.clientX, e.clientY);
    const dropX = worldPos.x;
    const dropY = worldPos.y;

    const promises = imageFiles.map((file, index) => {
        return new Promise<Note>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                const img = new Image();
                img.src = result;
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
                        type: 'evidence',
                        content: file.name,
                        fileId: result,
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
            };
            reader.readAsDataURL(file);
        });
    });

    const loadedNotes = await Promise.all(promises);
    if (loadedNotes.length > 0) {
        setMaxZIndex(prev => prev + loadedNotes.length);
        setNotes(prev => [...prev, ...loadedNotes]);
        setSelectedNodeId(loadedNotes[loadedNotes.length - 1].id);
    }
  }, [maxZIndex, toWorld]);

  useEffect(() => {
    const globalUp = () => handleMouseUp();
    window.addEventListener('mouseup', globalUp);
    return () => window.removeEventListener('mouseup', globalUp);
  }, [isPanning, draggingId, rotatingId, resizingId]);

  return (
    <div 
      ref={boardRef}
      className={`w-screen h-screen relative overflow-hidden select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
          backgroundColor: '#8b5a2b',
          backgroundImage: `url("${CORK_URL}")`,
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${40 * view.zoom}px ${40 * view.zoom}px`,
      }}
      onWheel={handleWheel}
      onMouseDown={handleBackgroundMouseDown}
      onMouseMove={handleMouseMove}
      onClick={handleBackgroundClick}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
    >
      {/* Background Music Audio Element */}
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* UI Controls: Left (Tools) */}
      <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-auto cursor-auto">
         <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-float border border-white/10 max-w-sm">
            <h1 className="text-xl font-bold font-handwriting mb-1 text-red-500">CASE #2023-X</h1>
            <p className="text-xs text-gray-300 mb-4">
               {isPinMode ? (
                 <span className="text-yellow-400 font-bold animate-pulse">PIN MODE ACTIVE</span>
               ) : (
                 <span className="text-gray-400">Drag background to pan. Scroll to zoom.</span>
               )}
            </p>
            <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setIsPinMode(!isPinMode)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-bold transition-all ${
                      isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <MapPin size={16} /> {isPinMode ? 'DONE' : 'PIN TOOL'}
                </button>

                <div className="grid grid-cols-2 gap-2 mt-2">
                   <button onClick={() => addNote('note')} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs">Add Note</button>
                   <button onClick={() => addNote('photo')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Add Photo</button>
                   <button onClick={() => addNote('dossier')} className="px-2 py-1 bg-orange-800 hover:bg-orange-700 rounded text-xs">Add Dossier</button>
                   <button onClick={() => addNote('scrap')} className="px-2 py-1 bg-stone-300 hover:bg-stone-200 text-stone-900 rounded text-xs">Add Scrap</button>
                   <button onClick={clearBoard} className="px-3 py-1 col-span-2 border border-red-900 text-red-400 hover:bg-red-900/50 rounded text-xs flex items-center justify-center gap-1">
                      <Trash2 size={12}/> Clear
                   </button>
                </div>
            </div>
         </div>
      </div>

      {/* UI Controls: Right (Zoom & Music) */}
      <div className="absolute top-4 right-4 z-[9999] bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-float pointer-events-auto cursor-auto">
          <button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-t-lg transition-colors"><Plus size={20} /></button>
          <div className="text-xs font-mono py-1 w-12 text-center border-y border-white/10 select-none">
              {Math.round(view.zoom * 100)}%
          </div>
          <button onClick={handleZoomOut} className="p-2 hover:bg-white/10 border-b border-white/10 transition-colors"><Minus size={20} /></button>
          <button onClick={toggleMusic} className="p-2 hover:bg-white/10 rounded-b-lg transition-colors" title={isMusicPlaying ? "Mute Music" : "Play Music"}>
            {isMusicPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
      </div>

      {connectingNodeId && (
         <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-red-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce font-bold pointer-events-none">
            Connecting Evidence...
         </div>
      )}

      {isDraggingFile && (
         <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none">
             <div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce">
                 <UploadCloud size={64} className="text-blue-400"/>
                 <h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2>
             </div>
         </div>
      )}

      {/* --- TRANSFORM LAYER --- */}
      <div 
        className="absolute top-0 left-0 w-0 h-0 overflow-visible pointer-events-none"
        style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
        }}
      >
          {notes.map((note) => (
            <DetectiveNode
              key={note.id}
              note={note}
              onMouseDown={handleNodeMouseDown}
              onDoubleClick={handleDoubleClick}
              isConnecting={!!connectingNodeId}
              isSelectedForConnection={connectingNodeId === note.id}
              isPinMode={isPinMode}
              isSelected={selectedNodeId === note.id}
              onDelete={() => handleDeleteNote(note.id)}
              onStartPin={() => handleStartPinFromCorner(note.id)}
              onResize={handleUpdateNodeSize}
              onRotateStart={(e) => handleRotateStart(e, note.id)}
              onResizeStart={(e, mode) => handleResizeStart(e, note.id, mode)}
            />
          ))}
          
          <ConnectionLayer 
            connections={connections} 
            notes={notes}
            connectingNodeId={connectingNodeId}
            mousePos={mousePos}
            onDeleteConnection={handleDeleteConnection}
            onPinClick={handlePinClick} 
            isPinMode={isPinMode}
          />
      </div>

      {editingNodeId && getEditingNote() && (
        <EditModal 
          note={getEditingNote()!} 
          onSave={handleSaveNote} 
          onClose={() => setEditingNodeId(null)} 
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)] z-[9990]"></div>
    </div>
  );
};

export default App;