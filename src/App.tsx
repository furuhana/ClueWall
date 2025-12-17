import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection, DragOffset } from './types';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { uploadImage } from './api'; 

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";
type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
interface TransformStartData { mouseX: number; mouseY: number; initialRotation: number; initialWidth: number; initialHeight: number; initialX: number; initialY: number; initialScale: number; resizeMode?: ResizeMode; }
interface PinDragData { noteId: string; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }
interface SelectionBox { startX: number; startY: number; currentX: number; currentY: number; }

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null); 
  const [maxZIndex, setMaxZIndex] = useState<number>(10);
  
  // 🟢 选择状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [transformStart, setTransformStart] = useState<TransformStartData | null>(null);
  const [pinDragData, setPinDragData] = useState<PinDragData | null>(null);
  const isPinDragRef = useRef(false);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isPinMode, setIsPinMode] = useState<boolean>(false);
  
  // 默认隐藏 UI
  const [isUIHidden, setIsUIHidden] = useState<boolean>(true); 
  const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
  
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId });
  useEffect(() => { interactionRef.current = { draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId }; }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId]);
  const toWorld = useCallback((screenX: number, screenY: number) => { return { x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }; }, [view]);

  // 1. 监听隐藏状态，触发 Toast
  useEffect(() => {
    if (isUIHidden) {
      setShowHiddenModeToast(true);
      const timer = setTimeout(() => { setShowHiddenModeToast(false); }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowHiddenModeToast(false);
    }
  }, [isUIHidden]);

  // 2. 删除功能
  const deleteFromCloud = async (noteId?: string, connId?: string) => {
      if (noteId) await supabase.from('notes').delete().eq('id', noteId);
      if (connId) await supabase.from('connections').delete().eq('id', connId);
  };

  const handleDeleteNote = (id: string) => { 
      if (connectingNodeId === id) setConnectingNodeId(null);

      const nextNotes = notes.filter(n => n.id !== id); 
      const nextConns = connections.filter(c => c.sourceId !== id && c.targetId !== id); 
      setNotes(nextNotes); 
      setConnections(nextConns); 
      deleteFromCloud(id); 
      const relatedConns = connections.filter(c => c.sourceId === id || c.targetId === id); 
      relatedConns.forEach(c => deleteFromCloud(undefined, c.id)); 
  };

  const handleDeleteConnection = (id: string) => { 
      const nextConns = connections.filter(c => c.id !== id); 
      setConnections(nextConns); 
      deleteFromCloud(undefined, id); 
  };

  // 3. 全局键盘监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (editingNodeId) return;

          const { connectingNodeId: activeConnectingId, selectedIds: currentSelected, notes: currentNotes, connections: currentConns } = interactionRef.current;

          // 🚨 如果正在连线，删除图钉（保留 Note）
          if (activeConnectingId) {
              const nextNotes = currentNotes.map(n => 
                  n.id === activeConnectingId ? { ...n, hasPin: false } : n
              );
              const nextConns = currentConns.filter(c => c.sourceId !== activeConnectingId && c.targetId !== activeConnectingId);

              setNotes(nextNotes);
              setConnections(nextConns);
              setConnectingNodeId(null); 
              setSelectedIds(new Set()); 

              const changedNote = nextNotes.find(n => n.id === activeConnectingId);
              if (changedNote) saveToCloud([changedNote], []); 

              const deletedConns = currentConns.filter(c => c.sourceId === activeConnectingId || c.targetId === activeConnectingId);
              deletedConns.forEach(c => deleteFromCloud(undefined, c.id));
              
              return; 
          }

          // 🚨 正常删除
          if (currentSelected.size > 0) {
              const idsArray = Array.from(currentSelected);
              const nextNotes = currentNotes.filter(n => !currentSelected.has(n.id));
              const nextConns = currentConns.filter(c => !currentSelected.has(c.sourceId) && !currentSelected.has(c.targetId));
              
              setNotes(nextNotes);
              setConnections(nextConns);
              setSelectedIds(new Set());

              idsArray.forEach(id => deleteFromCloud(id));
              const deletedConns = currentConns.filter(c => currentSelected.has(c.sourceId) || currentSelected.has(c.targetId));
              deletedConns.forEach(c => deleteFromCloud(undefined, c.id));
          }
      }

      if (e.key === 'Escape') {
        if (isUIHidden) {
             setIsUIHidden(false); 
        } else {
             setConnectingNodeId(null);
             setIsPinMode(false);
             setSelectionBox(null);
             setDraggingId(null);
             setRotatingId(null);
             setResizingId(null);
             setSelectedIds(new Set());
        }
      }
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isUIHidden, editingNodeId]); 

  // 实时订阅
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: notesData } = await supabase.from('notes').select('*');
      const { data: connsData } = await supabase.from('connections').select('*');
      if (notesData) {
         const uniqueNotes = Array.from(new Map(notesData.map((item: any) => [item.id, item])).values());
         setNotes(uniqueNotes as any);
         const maxZ = notesData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
         setMaxZIndex(maxZ);
      }
      if (connsData) {
         const uniqueConns = Array.from(new Map(connsData.map((item: any) => [item.id, item])).values());
         setConnections(uniqueConns as any);
      }
      setIsLoading(false);
    };
    fetchInitialData();

    const channel = supabase.channel('detective-wall-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (payload) => {
          if (payload.eventType === 'INSERT') {
             setNotes(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new as Note]);
          } else if (payload.eventType === 'UPDATE') {
             const newNote = payload.new as Note;
             setNotes(prev => prev.map(n => {
                const current = interactionRef.current;
                if (n.id === newNote.id && (current.draggingId === n.id || current.resizingId === n.id || current.rotatingId === n.id)) return n;
                return n.id === newNote.id ? newNote : n;
             }));
          } else if (payload.eventType === 'DELETE') setNotes(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload) => {
           if (payload.eventType === 'INSERT') {
              setConnections(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new as Connection]);
           }
           else if (payload.eventType === 'UPDATE') { const newConn = payload.new as Connection; setConnections(prev => prev.map(c => c.id === newConn.id ? newConn : c)); }
           else if (payload.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
      if (changedNotes.length > 0) await supabase.from('notes').upsert(changedNotes);
      if (changedConns.length > 0) await supabase.from('connections').upsert(changedConns);
  };

  const cancelAnimation = useCallback(() => { if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; } }, []);
  const handleResetView = () => {
      const start = { ...view }; const end = { x: 0, y: 0, zoom: 1 }; if (start.x === 0 && start.y === 0 && start.zoom === 1) return;
      const startTime = performance.now(); const duration = 1000; const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);
      const animate = (time: number) => {
          const elapsed = time - startTime; const progress = Math.min(elapsed / duration, 1); const ease = easeOutQuart(progress);
          const newX = start.x + (end.x - start.x) * ease; const newY = start.y + (end.y - start.y) * ease; const newZoom = start.zoom + (end.zoom - start.zoom) * ease;
          setView({ x: newX, y: newY, zoom: newZoom });
          if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate); else animationFrameRef.current = null;
      };
      cancelAnimation(); animationFrameRef.current = requestAnimationFrame(animate);
  };

  const handleWheel = (e: React.WheelEvent) => { if (editingNodeId) return; cancelAnimation(); const delta = -e.deltaY * 0.001; const newZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0); const worldMouse = toWorld(e.clientX, e.clientY); setView({ x: e.clientX - worldMouse.x * newZoom, y: e.clientY - worldMouse.y * newZoom, zoom: newZoom }); };
  
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    cancelAnimation();
    if (e.button === 1 || isSpacePressed) {
        e.preventDefault(); setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
        if (!e.ctrlKey && !e.shiftKey) setSelectedIds(new Set());
        setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
    }
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (!isPanning && !selectionBox && (e.target === boardRef.current)) { 
        setConnectingNodeId(null); setSelectedIds(new Set()); setIsPinMode(false); 
    }
  };

  const handleZoomIn = () => setView(v => ({...v, zoom: Math.min(v.zoom + 0.2, 3)}));
  const handleZoomOut = () => setView(v => ({...v, zoom: Math.max(v.zoom - 0.2, 0.1)}));

  const handleRotateStart = (e: React.MouseEvent, id: string) => { e.stopPropagation(); e.preventDefault(); const note = notes.find(n => n.id === id); if(!note) return; setRotatingId(id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth:0, initialHeight:0, initialX:0, initialY:0, initialScale:1 }); };
  
  const handleResizeStart = (e: React.MouseEvent, id: string, mode: ResizeMode) => { 
      e.stopPropagation(); e.preventDefault(); 
      const note = notes.find(n => n.id === id); 
      if(!note) return; 

      if (['note', 'dossier', 'scrap'].includes(note.type)) {
          if (mode === 'TOP' || mode === 'BOTTOM') {
              return; 
          }
      }

      const dims = getNoteDimensions(note); 
      setResizingId(id); 
      setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: dims.width, initialHeight: dims.height, initialX: note.x, initialY: note.y, initialScale: note.scale || 1, resizeMode: mode }); 
  };

  const handlePinMouseDown = (e: React.MouseEvent, id: string) => { 
      e.stopPropagation(); 
      e.preventDefault(); 
      
      const note = notes.find(n => n.id === id); 
      if (!note) return; 
      const { width, height } = getNoteDimensions(note); 
      isPinDragRef.current = false; 
      setPinDragData({ noteId: id, startX: e.clientX, startY: e.clientY, initialPinX: note.pinX ?? width / 2, initialPinY: note.pinY ?? 10, rotation: note.rotation, width, height }); 
  };
  
  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 
    
    if (isPinMode || connectingNodeId) {
        const targetNote = notes.find(n => n.id === id); if (!targetNote) return;
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

        if (isPinMode) { const nextNotes = notes.map((n) => n.id === id ? updatePin(n) : n); setNotes(nextNotes); saveToCloud(nextNotes, connections); return; }
        if (connectingNodeId) {
            if (connectingNodeId === id) return;
            const nextNotes = notes.map((n) => n.id === id ? updatePin(n) : n);
            let nextConns = connections;
            const exists = connections.some(c => (c.sourceId === connectingNodeId && c.targetId === id) || (c.sourceId === id && c.targetId === connectingNodeId));
            if (!exists) { nextConns = [...connections, { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' }]; }
            setNotes(nextNotes); setConnections(nextConns); setConnectingNodeId(null); saveToCloud(nextNotes, nextConns); return;
        }
        return;
    }

    const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
    if (isMultiSelect) {
        setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    } else {
        if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
    }

    const newZ = maxZIndex + 1; setMaxZIndex(newZ);
    if (e.altKey) {
          const targetNote = notes.find(n => n.id === id);
          if (targetNote) {
              const newId = `dup-${Date.now()}-${Math.random()}`;
              const duplicatedNote: Note = { ...targetNote, id: newId, zIndex: newZ, x: targetNote.x + 20, y: targetNote.y + 20, hasPin: false, title: targetNote.title ? `${targetNote.title} (Copy)` : undefined, };
              setNotes([...notes, duplicatedNote]); setDraggingId(newId); setSelectedIds(new Set([newId])); 
              lastDragPosRef.current = { x: e.clientX, y: e.clientY };
          }
          return;
    }

    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));
    setDraggingId(id); 
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (selectionBox) {
        const currentX = e.clientX; 
        const currentY = e.clientY;
        setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);

        const screenBoxLeft = Math.min(selectionBox.startX, currentX);
        const screenBoxRight = Math.max(selectionBox.startX, currentX);
        const screenBoxTop = Math.min(selectionBox.startY, currentY);
        const screenBoxBottom = Math.max(selectionBox.startY, currentY);

        const worldBoxLeft = (screenBoxLeft - view.x) / view.zoom;
        const worldBoxRight = (screenBoxRight - view.x) / view.zoom;
        const worldBoxTop = (screenBoxTop - view.y) / view.zoom;
        const worldBoxBottom = (screenBoxBottom - view.y) / view.zoom;

        const newSelected = new Set<string>();

        notes.forEach(note => {
            const dims = getNoteDimensions(note);
            const width = (dims.width || note.width || 200) * (note.scale || 1);
            const height = (dims.height || note.height || 200) * (note.scale || 1);

            const noteLeft = note.x;
            const noteRight = note.x + width;
            const noteTop = note.y;
            const noteBottom = note.y + height;

            const isMissed = 
                noteLeft > worldBoxRight || 
                noteRight < worldBoxLeft || 
                noteTop > worldBoxBottom || 
                noteBottom < worldBoxTop;

            if (!isMissed) {
                newSelected.add(note.id);
            }
        });

        setSelectedIds(newSelected);
        return;
    }

    if (draggingId && lastDragPosRef.current) {
        const dx = (e.clientX - lastDragPosRef.current.x) / view.zoom;
        const dy = (e.clientY - lastDragPosRef.current.y) / view.zoom;
        setNotes(prev => prev.map(n => {
            if (n.id === draggingId || selectedIds.has(n.id)) { return { ...n, x: n.x + dx, y: n.y + dy }; }
            return n;
        }));
        lastDragPosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }
    
    if (pinDragData) { /* ... same pin logic ... */ isPinDragRef.current = true; const screenDx = e.clientX - pinDragData.startX; const screenDy = e.clientY - pinDragData.startY; const worldDx = screenDx / view.zoom; const worldDy = screenDy / view.zoom; const rad = -(pinDragData.rotation * Math.PI) / 180; const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad); const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad); let newPinX = pinDragData.initialPinX + localDx; let newPinY = pinDragData.initialPinY + localDy; newPinX = Math.max(0, Math.min(newPinX, pinDragData.width)); newPinY = Math.max(0, Math.min(newPinY, pinDragData.height)); setNotes(prev => prev.map(n => n.id === pinDragData.noteId ? { ...n, pinX: newPinX, pinY: newPinY } : n)); return; }
    if (isPanning && lastMousePosRef.current) { const dx = e.clientX - lastMousePosRef.current.x; const dy = e.clientY - lastMousePosRef.current.y; setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; return; }
    if (rotatingId && transformStart) { const deltaX = e.clientX - transformStart.mouseX; const newRotation = transformStart.initialRotation - (deltaX * 0.5); setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: newRotation } : n)); return; }
    if (resizingId && transformStart) { const note = notes.find(n => n.id === resizingId); if(!note) return; const mode = transformStart.resizeMode; const screenDx = e.clientX - transformStart.mouseX; const screenDy = e.clientY - transformStart.mouseY; const worldDx = screenDx / view.zoom; const worldDy = screenDy / view.zoom; const rad = -(transformStart.initialRotation * Math.PI) / 180; const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad); const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);
        if (mode === 'CORNER') { const aspectRatio = transformStart.initialWidth / transformStart.initialHeight; const avgWidthChange = (-localDx + localDy * aspectRatio) / 2; let newWidth = Math.max(30, transformStart.initialWidth + avgWidthChange); let newHeight = newWidth / aspectRatio; const widthChange = newWidth - transformStart.initialWidth; const heightChange = newHeight - transformStart.initialHeight; setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newWidth, height: newHeight, scale: ['note','dossier','scrap'].includes(n.type) ? (newWidth/(transformStart.initialWidth/transformStart.initialScale)) : undefined, x: transformStart.initialX - (widthChange / 2), y: transformStart.initialY - (heightChange / 2) } : n)); }
        else { let newWidth = transformStart.initialWidth; let newHeight = transformStart.initialHeight; let newX = transformStart.initialX; let newY = transformStart.initialY; const MIN_W = 30; const MIN_H = 30; if (mode === 'LEFT') { newWidth = Math.max(MIN_W, transformStart.initialWidth - localDx); newX = transformStart.initialX + localDx; } else if (mode === 'RIGHT') { newWidth = Math.max(MIN_W, transformStart.initialWidth + localDx); } else if (mode === 'TOP') { newHeight = Math.max(MIN_H, transformStart.initialHeight - localDy); newY = transformStart.initialY + localDy; } else if (mode === 'BOTTOM') { newHeight = Math.max(MIN_H, transformStart.initialHeight + localDy); } setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newWidth, height: newHeight, x: newX, y: newY } : n)); } return;
    }
    const worldMouse = toWorld(e.clientX, e.clientY); if (connectingNodeId) setMousePos({ x: worldMouse.x, y: worldMouse.y }); 
  }, [isPanning, draggingId, connectingNodeId, view, toWorld, rotatingId, resizingId, transformStart, pinDragData, notes, selectionBox, selectedIds]); 

  const handleMouseUp = () => {
    if (draggingId) {
        const changedNotes = notes.filter(n => n.id === draggingId || selectedIds.has(n.id));
        if (changedNotes.length > 0) saveToCloud(changedNotes, []);
    }
    if (resizingId || rotatingId || pinDragData) { const id = resizingId || rotatingId || pinDragData?.noteId; const note = notes.find(n => n.id === id); if (note) saveToCloud([note], []); }
    setIsPanning(false); setDraggingId(null); setRotatingId(null); setResizingId(null); setTransformStart(null); setPinDragData(null); setSelectionBox(null); lastMousePosRef.current = null; lastDragPosRef.current = null;
  };

  const handlePinClick = (e: React.MouseEvent, id: string) => { 
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
                  const newConn = { id: `c-${Date.now()}-${Math.random()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' }; 
                  const finalConns = [...nextConns, newConn]; 
                  setConnections(finalConns); 
                  saveToCloud(notes, finalConns); 
              } 
          } 
          setConnectingNodeId(null); 
      } 
  };

  const handleUpdateConnectionColor = (id: string, color: string) => { const nextConns = connections.map(c => c.id === id ? { ...c, color } : c); setConnections(nextConns); saveToCloud(notes, nextConns); };
  const handleStartPinFromCorner = (id: string) => setIsPinMode(true);
  const addNote = (type: Note['type']) => { const centerX = window.innerWidth / 2; const centerY = window.innerHeight / 2; const worldPos = toWorld(centerX, centerY); const x = worldPos.x + (Math.random() * 100 - 50); const y = worldPos.y + (Math.random() * 100 - 50); const id = `new-${Date.now()}`; let width = 256; let height = 160; if (type === 'photo') height = 280; else if (type === 'dossier') height = 224; else if (type === 'scrap') { width = 257; height = 50; } else if (type === 'marker') { width = 30; height = 30; } let content = 'New Clue'; if (type === 'photo') content = 'New Evidence'; else if (type === 'scrap') content = 'Scrap note...'; else if (type === 'marker') { const existingMarkers = notes.filter(n => n.type === 'marker'); content = (existingMarkers.length + 1).toString(); } const newNote: Note = { id, type, content, x, y, zIndex: maxZIndex + 1, rotation: (Math.random() * 10) - 5, fileId: type === 'photo' ? '/photo_1.png' : undefined, hasPin: false, scale: 1, width, height }; const nextNotes = [...notes, newNote]; setMaxZIndex(prev => prev + 1); setNotes(nextNotes); setSelectedIds(new Set([id])); saveToCloud(nextNotes, connections); };
  const clearBoard = async () => { if(window.confirm("Burn all evidence?")) { setNotes([]); setConnections([]); await supabase.from('notes').delete().neq('id', '0'); await supabase.from('connections').delete().neq('id', '0'); } };
  const handleDoubleClick = (id: string) => { if (!isPinMode && !connectingNodeId) setEditingNodeId(id); };
  const handleSaveNote = (updatedNote: Note) => { setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n)); setEditingNodeId(null); saveToCloud([updatedNote], []); };
  const getEditingNote = () => notes.find(n => n.id === editingNodeId);
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current += 1; if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDraggingFile(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false); dragCounter.current = 0; const files = Array.from(e.dataTransfer.files) as File[]; const imageFiles = files.filter(file => file.type.startsWith('image/')); if (imageFiles.length === 0) return;
    let currentZ = maxZIndex; const worldPos = toWorld(e.clientX, e.clientY); const dropX = worldPos.x; const dropY = worldPos.y;
    const promises = imageFiles.map(async (file, index) => { const driveFileId = await uploadImage(file); if (!driveFileId) return null; return new Promise<Note>((resolve) => { const img = new Image(); img.src = driveFileId; img.onload = () => { const MAX_WIDTH = 300; let finalWidth = img.width; let finalHeight = img.height; if (finalWidth > MAX_WIDTH) { const ratio = MAX_WIDTH / finalWidth; finalWidth = MAX_WIDTH; finalHeight = finalHeight * ratio; } if (finalWidth < 50) finalWidth = 50; if (finalHeight < 50) finalHeight = 50; currentZ++; resolve({ id: `evidence-${Date.now()}-${index}`, type: 'evidence', content: file.name, fileId: driveFileId, x: dropX - (finalWidth/2) + (index*20), y: dropY - (finalHeight/2) + (index*20), zIndex: currentZ, rotation: (Math.random()*10)-5, hasPin: false, width: finalWidth, height: finalHeight, scale: 1 }); }; }); });
    const loadedNotes = (await Promise.all(promises)).filter(n => n !== null) as Note[]; if (loadedNotes.length > 0) { const newMaxZ = currentZ; setMaxZIndex(newMaxZ); const nextNotes = [...notes, ...loadedNotes]; setNotes(nextNotes); setSelectedIds(new Set([loadedNotes[0].id])); saveToCloud(loadedNotes, []); }
  }, [maxZIndex, toWorld, notes, connections]);

  const handleUpdateNodeSize = (id: string, width: number, height: number) => { if (resizingId === id) return; setNotes(prev => prev.map(n => n.id === id ? { ...n, width, height } : n)); };
  const isUIHiddenRef = useRef(isUIHidden); useEffect(() => { isUIHiddenRef.current = isUIHidden; }, [isUIHidden]);
  useEffect(() => { const t = setTimeout(() => { if (isUIHiddenRef.current) setShowHiddenModeToast(true); }, 1000); return () => clearTimeout(t); }, []); 
  useEffect(() => { if (showHiddenModeToast) { const t = setTimeout(() => setShowHiddenModeToast(false), 3000); return () => clearTimeout(t); } }, [showHiddenModeToast]);
  useEffect(() => { if (audioRef.current) { audioRef.current.volume = 0.5; audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false)); } }, []);
  const toggleMusic = () => { if (!audioRef.current) return; if (isMusicPlaying) { audioRef.current.pause(); setIsMusicPlaying(false); } else { audioRef.current.play().then(() => setIsMusicPlaying(true)); } };
  useEffect(() => { const globalUp = () => handleMouseUp(); window.addEventListener('mouseup', globalUp); return () => window.removeEventListener('mouseup', globalUp); }, [isPanning, draggingId, rotatingId, resizingId, pinDragData, notes, connections, selectedIds]);

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden select-none ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`} style={{ backgroundImage: `url("${GRID_URL}"), linear-gradient(180deg, #A38261 22.65%, #977049 100%)`, backgroundPosition: `${view.x}px ${view.y}px, 0 0`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px, 100% 100%`, backgroundRepeat: 'repeat, no-repeat', backgroundColor: '#A38261' }} onWheel={handleWheel} onMouseDown={handleBackgroundMouseDown} onMouseMove={handleMouseMove} onClick={handleBackgroundClick} onDrop={handleDrop} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver}>
      <style>{`.animate-dash { stroke-dasharray: 8 4 !important; }`}</style>
      <audio ref={audioRef} src="/home_bgm.mp3" loop />
      {isLoading && <div className="absolute bottom-4 left-4 z-[12000] flex items-center gap-3 bg-black/70 backdrop-blur-md text-white/90 px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-none"><Loader2 className="animate-spin text-yellow-400" size={16} /><span className="font-mono text-xs tracking-wider">SYNCING...</span></div>}
      {!isLoading && <div className="absolute bottom-4 left-4 z-[12000] flex items-center gap-2 pointer-events-none opacity-50 hover:opacity-100 transition-opacity"><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" /><span className="font-mono text-[10px] text-white/70 tracking-widest">SECURE CONN.</span></div>}
      
      {/* 提示 UI */}
      <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full backdrop-blur-md border border-white/10 transition-opacity duration-500 pointer-events-none z-[13000] ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>
          <span className="font-mono text-xs">PRESS ESC TO SHOW UI</span>
      </div>

      {!isUIHidden && <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-auto cursor-auto"><div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-float border border-white/10 max-w-sm"><h1 className="text-xl font-bold font-handwriting mb-1 text-red-500">CASE #2023-X</h1><div className="flex flex-col gap-2"><button onClick={() => setIsPinMode(!isPinMode)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}><MapPin size={16} /> {isPinMode ? 'DONE' : 'PIN TOOL'}</button><div className="grid grid-cols-2 gap-2 mt-2"><button onClick={() => addNote('note')} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs">Add Note</button><button onClick={() => addNote('photo')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">Add Photo</button><button onClick={() => addNote('dossier')} className="px-2 py-1 bg-orange-800 hover:bg-orange-700 rounded text-xs">Add Dossier</button><button onClick={() => addNote('scrap')} className="px-2 py-1 bg-stone-300 hover:bg-stone-200 text-stone-900 rounded text-xs">Add Scrap</button><button onClick={() => addNote('marker')} className="px-3 py-1 bg-[#ABBDD7] hover:bg-[#9aacd0] text-blue-900 font-bold col-span-2 rounded text-xs flex items-center justify-center gap-1">Add Marker</button><button onClick={clearBoard} className="px-3 py-1 col-span-2 border border-red-900 text-red-400 hover:bg-red-900/50 rounded text-xs flex items-center justify-center gap-1"><Trash2 size={12}/> Clear</button></div></div></div></div>}
      {!isUIHidden && <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto cursor-auto"><div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-float"><button onClick={handleZoomIn} className="p-2 hover:bg-white/10 rounded-t-lg transition-colors"><Plus size={20} /></button><div className="text-xs font-mono py-1 w-12 text-center border-y border-white/10 select-none">{Math.round(view.zoom * 100)}%</div><button onClick={handleZoomOut} className="p-2 hover:bg-white/10 border-b border-white/10 transition-colors"><Minus size={20} /></button><button onClick={toggleMusic} className="p-2 hover:bg-white/10 rounded-b-lg transition-colors" title={isMusicPlaying ? "Mute Music" : "Play Music"}>{isMusicPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}</button></div><div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-float"><button onClick={handleResetView} className="p-2 hover:bg-white/10 rounded-t-lg border-b border-white/10 transition-colors" title="Reset View"><LocateFixed size={20} /></button><button onClick={() => { setIsUIHidden(true); }} className="p-2 hover:bg-white/10 rounded-b-lg transition-colors" title="Hide UI"><Maximize size={20} /></button></div></div>}
      {connectingNodeId && !isUIHidden && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-red-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce font-bold pointer-events-none">Connecting Evidence...</div>}
      {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce"><UploadCloud size={64} className="text-blue-400"/><h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2></div></div>}

      {/* 🟢 选框层 */}
      {selectionBox && (
          <div style={{ position: 'absolute', left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY), backgroundColor: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', zIndex: 9999, pointerEvents: 'none' }} />
      )}

      <div className="absolute top-0 left-0 w-0 h-0 overflow-visible pointer-events-none" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode
              key={note.id}
              note={note}
              onMouseDown={handleNodeMouseDown}
              onDoubleClick={handleDoubleClick}
              isConnecting={!!connectingNodeId}
              isSelectedForConnection={connectingNodeId === note.id}
              isPinMode={isPinMode}
              isSelected={selectedIds.has(note.id)}
              isMultiSelected={selectedIds.size > 1} 
              onDelete={() => handleDeleteNote(note.id)}
              onStartPin={() => handleStartPinFromCorner(note.id)}
              onResize={handleUpdateNodeSize}
              onRotateStart={(e) => handleRotateStart(e, note.id)}
              onResizeStart={(e, mode) => handleResizeStart(e, note.id, mode)}
            />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} onDeleteConnection={handleDeleteConnection} onPinClick={handlePinClick} isPinMode={isPinMode} onConnectionColorChange={handleUpdateConnectionColor} onPinMouseDown={handlePinMouseDown} />
          
          {/* 🟢 修复3：恢复数值覆盖层 + 🟢 新增：图钉坐标显示 */}
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
      {editingNodeId && getEditingNote() && <EditModal note={getEditingNote()!} onSave={handleSaveNote} onClose={() => setEditingNodeId(null)} />}
    </div>
  );
};
export default App;