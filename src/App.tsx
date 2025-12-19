import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection, DragOffset } from './types';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { 
  Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2,
  StickyNote, Image as ImageIcon, Folder, FileText, Crosshair, Layout, Edit3, Check, FolderKanban
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { uploadImage, deleteImageFromDrive } from './api'; 

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";
type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
interface TransformStartData { mouseX: number; mouseY: number; initialRotation: number; initialWidth: number; initialHeight: number; initialX: number; initialY: number; initialScale: number; resizeMode?: ResizeMode; }
interface PinDragData { noteId: string; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }
interface SelectionBox { startX: number; startY: number; currentX: number; currentY: number; }
interface Board { id: string; name: string; }

const NOTE_TYPES: Note['type'][] = ['note', 'photo', 'dossier', 'scrap', 'marker'];

const App: React.FC = () => {
  // --- 状态管理 ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);
  
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('v1'); 
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState("");

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
  const [isUIHidden, setIsUIHidden] = useState<boolean>(true); 
  const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
  const [ghostNote, setGhostNote] = useState<{ x: number; y: number; typeIndex: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null); 
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 引用同步
  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId });
  useEffect(() => { 
    interactionRef.current = { draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId]);
  
  const toWorld = useCallback((screenX: number, screenY: number) => ({ x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }), [view]);

  // --- 1. 快捷键 & 工具函数 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        setIsUIHidden(prev => !prev);
        if (!isUIHidden) setShowHiddenModeToast(true);
        return;
      }
      if (interactionRef.current.ghostNote) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + 1) % NOTE_TYPES.length } : null);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex - 1 + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
          if (e.key === 'Enter') confirmGhostCreation();
      }
      if (e.key === 'Escape') {
        if (interactionRef.current.ghostNote) setGhostNote(null);
        else if (interactionRef.current.isUIHidden) setIsUIHidden(false);
        else { setConnectingNodeId(null); setIsPinMode(false); setSelectionBox(null); }
      }
      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { setIsSpacePressed(false); setIsPanning(false); } };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

  const handleZoomIn = () => setView(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 3.0) }));
  const handleZoomOut = () => setView(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.1) }));
  const handleResetView = () => setView({ x: 0, y: 0, zoom: 1 });

  // --- 2. 数据加载 ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      const { data: bData } = await supabase.from('boards').select('*').order('updated_at', { ascending: true });
      if (bData && bData.length > 0) setBoards(bData);
      else {
        const def = { id: 'v1', name: 'Version 1' };
        await supabase.from('boards').insert([def]);
        setBoards([def]);
      }
      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);
      setNotes(nData ? (nData as any) : []);
      if (nData) setMaxZIndex(nData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10));
      setConnections(cData ? (cData as any) : []);
      setIsLoading(false);
    };
    fetchInitialData();
  }, [activeBoardId]);

  // --- 3. 核心保存与复制逻辑 ---
  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
      if (changedNotes.length > 0) await supabase.from('notes').upsert(changedNotes.map(n => ({ ...n, board_id: activeBoardId })));
      if (changedConns.length > 0) await supabase.from('connections').upsert(changedConns.map(c => ({ ...c, board_id: activeBoardId })));
  };

  const handleDeleteNote = (id: string) => {
    const target = notes.find(n => n.id === id);
    if (target?.fileId) deleteImageFromDrive(target.fileId);
    setNotes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    supabase.from('notes').delete().eq('id', id).then(() => {});
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 

    // 🟢 需求 1: Alt + 左键复制
    if (e.altKey) {
        const target = notes.find(n => n.id === id);
        if (target) {
            const newId = `dup-${Date.now()}`;
            const newZ = maxZIndex + 1; setMaxZIndex(newZ);
            const newNode = { ...target, id: newId, x: target.x + 20, y: target.y + 20, zIndex: newZ, hasPin: false };
            setNotes(prev => [...prev, newNode]);
            saveToCloud([newNode], []);
            setDraggingId(newId);
            lastDragPosRef.current = { x: e.clientX, y: e.clientY };
            return;
        }
    }

    if (isPinMode || connectingNodeId) {
        const target = notes.find(n => n.id === id); if (!target) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rad = -(target.rotation * Math.PI) / 180;
        const { width: w, height: h } = getNoteDimensions(target);
        const pinX = w/2 + ((e.clientX - (rect.left + rect.width/2)) * Math.cos(rad) - (e.clientY - (rect.top + rect.height/2)) * Math.sin(rad)) / view.zoom;
        const pinY = h/2 + ((e.clientX - (rect.left + rect.width/2)) * Math.sin(rad) + (e.clientY - (rect.top + rect.height/2)) * Math.cos(rad)) / view.zoom;

        if (isPinMode) {
          const updated = { ...target, hasPin: true, pinX, pinY };
          setNotes(notes.map(n => n.id === id ? updated : n));
          saveToCloud([updated], []);
        } else if (connectingNodeId && connectingNodeId !== id) {
          const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' };
          setConnections([...connections, newConn]);
          saveToCloud([], [newConn]);
          setConnectingNodeId(null);
        }
        return;
    }

    const isMulti = e.ctrlKey || e.shiftKey;
    if (isMulti) setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    const newZ = maxZIndex + 1; setMaxZIndex(newZ);
    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));
    setDraggingId(id); 
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

  // --- 4. 图钉操作逻辑 (需求 3 & 4) ---
  const handlePinMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const { width, height } = getNoteDimensions(note);
    isPinDragRef.current = false;
    setPinDragData({ noteId: id, startX: e.clientX, startY: e.clientY, initialPinX: note.pinX || width/2, initialPinY: note.pinY || 10, rotation: note.rotation, width, height });
  };

  const handlePinClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isPinDragRef.current) { isPinDragRef.current = false; return; }
    if (isPinMode) { setIsPinMode(false); setConnectingNodeId(id); return; }
    if (connectingNodeId === null) setConnectingNodeId(id);
    else if (connectingNodeId !== id) {
        const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' };
        setConnections([...connections, newConn]);
        saveToCloud([], [newConn]);
        setConnectingNodeId(null);
    }
  };

  // --- 5. 鼠标移动逻辑 (含数值计算) ---
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (selectionBox) {
        const currentX = e.clientX; const currentY = e.clientY;
        setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);
        const wL = (Math.min(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wR = (Math.max(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wT = (Math.min(selectionBox.startY, currentY) - view.y) / view.zoom;
        const wB = (Math.max(selectionBox.startY, currentY) - view.y) / view.zoom;
        const newSelected = new Set<string>();
        notes.forEach(n => {
            const d = getNoteDimensions(n);
            if (!(n.x > wR || n.x + d.width < wL || n.y > wB || n.y + d.height < wT)) newSelected.add(n.id);
        });
        setSelectedIds(newSelected);
        return;
    }

    if (draggingId && lastDragPosRef.current) {
        const dx = (e.clientX - lastDragPosRef.current.x) / view.zoom;
        const dy = (e.clientY - lastDragPosRef.current.y) / view.zoom;
        setNotes(prev => prev.map(n => (n.id === draggingId || selectedIds.has(n.id)) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
        lastDragPosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    if (pinDragData) {
        isPinDragRef.current = true;
        const dx = (e.clientX - pinDragData.startX) / view.zoom;
        const dy = (e.clientY - pinDragData.startY) / view.zoom;
        const rad = -(pinDragData.rotation * Math.PI) / 180;
        let nPX = pinDragData.initialPinX + (dx * Math.cos(rad) - dy * Math.sin(rad));
        let nPY = pinDragData.initialPinY + (dx * Math.sin(rad) + dy * Math.cos(rad));
        nPX = Math.max(0, Math.min(nPX, pinDragData.width));
        nPY = Math.max(0, Math.min(nPY, pinDragData.height));
        setNotes(prev => prev.map(n => n.id === pinDragData.noteId ? { ...n, pinX: nPX, pinY: nPY } : n));
        return;
    }

    if (resizingId && transformStart) {
        const note = notes.find(n => n.id === resizingId); if(!note) return;
        const dx = (e.clientX - transformStart.mouseX) / view.zoom;
        const dy = (e.clientY - transformStart.mouseY) / view.zoom;
        const rad = -(transformStart.initialRotation * Math.PI) / 180;
        const lDx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const lDy = dx * Math.sin(rad) + dy * Math.cos(rad);
        const L: any = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 224 }, marker: { w: 30, h: 30 } };
        const min = L[note.type] || { w: 30, h: 30 };
        let nW = transformStart.initialWidth, nH = transformStart.initialHeight, nX = transformStart.initialX, nY = transformStart.initialY;
        if (transformStart.resizeMode === 'RIGHT') nW = Math.max(min.w, transformStart.initialWidth + lDx);
        else if (transformStart.resizeMode === 'BOTTOM') nH = Math.max(min.h, transformStart.initialHeight + lDy);
        else if (transformStart.resizeMode === 'LEFT') { nW = Math.max(min.w, transformStart.initialWidth - lDx); nX = transformStart.initialX + (transformStart.initialWidth - nW); }
        else if (transformStart.resizeMode === 'TOP') { nH = Math.max(min.h, transformStart.initialHeight - lDy); nY = transformStart.initialY + (transformStart.initialHeight - nH); }
        setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: nW, height: nH, x: nX, y: nY } : n));
        return;
    }

    if (rotatingId && transformStart) {
        const deltaX = e.clientX - transformStart.mouseX;
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - (deltaX * 0.5) } : n));
        return;
    }
    
    if (isPanning && lastMousePosRef.current) {
        setView(v => ({ ...v, x: v.x + (e.clientX - lastMousePosRef.current!.x), y: v.y + (e.clientY - lastMousePosRef.current!.y) }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    if (connectingNodeId) setMousePos(toWorld(e.clientX, e.clientY));
  }, [draggingId, resizingId, rotatingId, selectionBox, view, notes, selectedIds, transformStart, pinDragData, isPanning]);

  const handleMouseUp = () => {
    const id = draggingId || resizingId || rotatingId || pinDragData?.noteId;
    if (id) {
        const changed = notes.filter(n => n.id === id || selectedIds.has(n.id));
        saveToCloud(changed, []);
    }
    setDraggingId(null); setResizingId(null); setRotatingId(null); setSelectionBox(null); setIsPanning(false); setPinDragData(null);
  };

  // --- 6. Marker & Ghost 逻辑 (需求 6) ---
  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    const L: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] };
    const dims = L[type] || [200, 200];
    
    // 🟢 需求 6: Marker 默认为数字
    let content = 'New Clue';
    if (type === 'marker') {
        const count = notes.filter(n => n.type === 'marker').length;
        content = (count + 1).toString();
    }

    const newNode: Note = { id: `n-${Date.now()}`, type, content, x: ghostNote.x - dims[0]/2, y: ghostNote.y - dims[1]/2, zIndex: maxZIndex + 1, rotation: 0, hasPin: false, width: dims[0], height: dims[1], scale: 1 };
    setNotes(prev => [...prev, newNode]);
    saveToCloud([newNode], []);
    setGhostNote(null);
  };

  const addNote = (type: Note['type']) => {
      const center = toWorld(window.innerWidth/2, window.innerHeight/2);
      setGhostNote({ x: center.x, y: center.y, typeIndex: NOTE_TYPES.indexOf(type) });
  };

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden bg-[#A38261] select-none ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`} 
         style={{ backgroundImage: `url("${GRID_URL}"), linear-gradient(180deg, #A38261 22.65%, #977049 100%)`, backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px` }}
         onWheel={handleWheel} 
         onMouseDown={(e) => {
           if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
           // 🟢 需求 5: 滚轮点击/Space 拖拽
           if (e.button === 1 || isSpacePressed) { e.preventDefault(); setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
           else if (e.button === 0) { setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); setSelectedIds(new Set()); }
         }} 
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
         onDoubleClick={(e) => { if(e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}>
      
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 左上角 UI */}
      {!isUIHidden && (
        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10">
            <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 flex items-center gap-2 uppercase">
              <FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}
            </h1>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => addNote('note')} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-bold">Add Note</button>
                <button onClick={() => addNote('photo')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold">Add Photo</button>
                <button onClick={() => addNote('dossier')} className="px-2 py-1 bg-orange-800 hover:bg-orange-700 rounded text-xs font-bold">Add Dossier</button>
                <button onClick={() => addNote('scrap')} className="px-2 py-1 bg-stone-300 hover:bg-stone-200 text-stone-900 rounded text-xs font-bold">Add Scrap</button>
                {/* 🟢 需求 6: Marker 按钮回来 */}
                <button onClick={() => addNote('marker')} className="col-span-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold">Add Marker</button>
            </div>
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
              {isPinMode ? 'FINISH PINNING' : 'ACTIVATE PIN TOOL'}
            </button>
          </div>
          {/* 画板列表省略... */}
        </div>
      )}

      {/* 右上角控制 */}
      {!isUIHidden && (
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={handleZoomIn} className="p-2 border-b border-white/10 hover:bg-white/10"><Plus size={20}/></button>
              <div className="text-[10px] font-mono py-1">{Math.round(view.zoom * 100)}%</div>
              <button onClick={handleZoomOut} className="p-2 border-b border-white/10 hover:bg-white/10"><Minus size={20}/></button>
              <button onClick={toggleMusic} className="p-2 hover:bg-white/10">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <button onClick={handleResetView} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl"><LocateFixed size={20}/></button>
            <button onClick={() => setIsUIHidden(true)} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl"><Maximize size={20}/></button>
        </div>
      )}

      {/* 画布渲染 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode key={note.id} note={note} onMouseDown={handleNodeMouseDown} isSelected={selectedIds.has(note.id)} 
                           onDoubleClick={() => setEditingNodeId(note.id)} 
                           onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: 1, resizeMode: m }); }} 
                           onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
                           onDelete={() => handleDeleteNote(note.id)} />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} onPinMouseDown={handlePinMouseDown} onPinClick={handlePinClick} />
          
          {/* 🟢 需求 2: 旋转/移动/图钉数值浮层 */}
          {(draggingId || resizingId || rotatingId || pinDragData) && (() => {
            const id = draggingId || resizingId || rotatingId || pinDragData?.noteId;
            const n = notes.find(i => i.id === id);
            if (!n) return null;
            let text = `X:${Math.round(n.x)} Y:${Math.round(n.y)}`;
            if (rotatingId) text = `${Math.round(n.rotation)}°`;
            if (resizingId) text = `W:${Math.round(n.width || 0)} H:${Math.round(n.height || 0)}`;
            if (pinDragData) text = `PinX:${Math.round(n.pinX || 0)} PinY:${Math.round(n.pinY || 0)}`;
            return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 200 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none">{text}</div></div>
          })()}

          {ghostNote && (() => {
              const t = NOTE_TYPES[ghostNote.typeIndex];
              const s: any = { note: 'border-yellow-500 text-yellow-500', photo: 'border-gray-400 text-gray-400', dossier: 'border-orange-600 text-orange-600', scrap: 'border-stone-400 text-stone-400', marker: 'border-blue-500 text-blue-500' };
              return (
                <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000 }} className="pointer-events-none">
                    <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm animate-pulse ${s[t]}`}>
                        <span className="text-[10px] font-bold uppercase">{t}</span>
                    </div>
                </div>
              );
          })()}
      </div>

      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>
      {editingNodeId && notes.find(n=>n.id===editingNodeId) && <EditModal note={notes.find(n=>n.id===editingNodeId)!} onSave={handleSaveNote} onClose={() => setEditingNodeId(null)} />}
    </div>
  );
};

export default App;