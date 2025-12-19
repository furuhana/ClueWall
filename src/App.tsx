import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection } from './types';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { 
  Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2,
  StickyNote, Image as ImageIcon, Folder, FileText, Edit3, FolderKanban, Layout
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
  const dragCounter = useRef(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 引用同步，用于事件处理器
  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode });
  useEffect(() => { 
    interactionRef.current = { ...interactionRef.current, draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode]);
  
  const toWorld = useCallback((screenX: number, screenY: number) => ({ x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }), [view]);

  // --- 1. 数据同步与加载 ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      const { data: bData } = await supabase.from('boards').select('*').order('updated_at', { ascending: true });
      if (bData && bData.length > 0) setBoards(bData);
      else { const def = { id: 'v1', name: 'Version 1' }; await supabase.from('boards').insert([def]); setBoards([def]); }
      
      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);
      setNotes(nData ? (nData as any) : []);
      if (nData) setMaxZIndex(nData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10));
      setConnections(cData ? (cData as any) : []);
      setIsLoading(false);
    };
    fetchInitialData();

    const channel = supabase.channel(`clue-wall-${activeBoardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setNotes(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new as Note]);
        if (payload.eventType === 'UPDATE') setNotes(prev => prev.map(n => n.id === payload.new.id ? (payload.new as Note) : n));
        if (payload.eventType === 'DELETE') setNotes(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setConnections(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new as Connection]);
        if (payload.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBoardId]);

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

  // --- 2. 交互逻辑（键盘监听：Delete, Ctrl+U） ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + U 切换 UI
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        const newState = !interactionRef.current.isUIHidden;
        setIsUIHidden(newState);
        if (newState) setShowHiddenModeToast(true);
        return;
      }

      // 删除键逻辑 (删除选中的卡片或活动的图钉)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingNodeId) return; // 正在输入时不执行删除
        const { selectedIds, connectingNodeId } = interactionRef.current;
        if (connectingNodeId) { setConnectingNodeId(null); return; } // 取消连线
        if (selectedIds.size > 0) {
            Array.from(selectedIds).forEach(id => handleDeleteNote(id));
            setSelectedIds(new Set());
        }
      }

      if (interactionRef.current.ghostNote) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + 1) % NOTE_TYPES.length } : null);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex - 1 + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
          if (e.key === 'Enter') confirmGhostCreation();
      }

      if (e.key === 'Escape') {
        if (interactionRef.current.ghostNote) setGhostNote(null);
        else if (interactionRef.current.isUIHidden) setIsUIHidden(false);
        else { setConnectingNodeId(null); setIsPinMode(false); setSelectionBox(null); setSelectedIds(new Set()); }
      }
      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [editingNodeId]);

  // --- 3. 鼠标核心逻辑（拖拽、拉伸、图钉连线） ---
  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 

    // 🟢 拦截：连线模式或图钉创建模式
    const { isPinMode, connectingNodeId } = interactionRef.current;
    if (isPinMode || (connectingNodeId && connectingNodeId !== id)) {
        const target = notes.find(n => n.id === id); if (!target) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rad = -(target.rotation * Math.PI) / 180;
        const { width: w, height: h } = getNoteDimensions(target);
        const pinX = w/2 + ((e.clientX - (rect.left + rect.width/2)) * Math.cos(rad) - (e.clientY - (rect.top + rect.height/2)) * Math.sin(rad)) / view.zoom;
        const pinY = h/2 + ((e.clientX - (rect.left + rect.width/2)) * Math.sin(rad) + (e.clientY - (rect.top + rect.height/2)) * Math.cos(rad)) / view.zoom;
        const updated = { ...target, hasPin: true, pinX, pinY };
        
        if (connectingNodeId) {
            const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' };
            setNotes(prev => prev.map(n => n.id === id ? updated : n));
            setConnections(prev => [...prev, newConn]);
            saveToCloud([updated], [newConn]);
            setConnectingNodeId(null);
        } else {
            setNotes(prev => prev.map(n => n.id === id ? updated : n));
            saveToCloud([updated], []);
        }
        setIsPinMode(false); return;
    }

    // 🟢 Alt 复制逻辑
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

    // 普通选中逻辑
    const isMulti = e.ctrlKey || e.shiftKey;
    if (isMulti) setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    const newZ = maxZIndex + 1; setMaxZIndex(newZ);
    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));
    setDraggingId(id); 
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 选框逻辑
    if (selectionBox) {
        const currentX = e.clientX, currentY = e.clientY;
        setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);
        const wL = (Math.min(selectionBox.startX, currentX) - view.x) / view.zoom, wR = (Math.max(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wT = (Math.min(selectionBox.startY, currentY) - view.y) / view.zoom, wB = (Math.max(selectionBox.startY, currentY) - view.y) / view.zoom;
        const newSelected = new Set<string>();
        notes.forEach(n => { 
            const d = getNoteDimensions(n);
            const r = n.x + d.width, b = n.y + d.height;
            if (!(n.x > wR || r < wL || n.y > wB || b < wT)) newSelected.add(n.id);
        });
        setSelectedIds(newSelected); return;
    }
    // 移动卡片
    if (draggingId && lastDragPosRef.current) {
        const dx = (e.clientX - lastDragPosRef.current.x) / view.zoom, dy = (e.clientY - lastDragPosRef.current.y) / view.zoom;
        setNotes(prev => prev.map(n => (n.id === draggingId || selectedIds.has(n.id)) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
        lastDragPosRef.current = { x: e.clientX, y: e.clientY }; return;
    }
    // 拖动图钉
    if (pinDragData) {
        isPinDragRef.current = true;
        const dx = (e.clientX - pinDragData.startX) / view.zoom, dy = (e.clientY - pinDragData.startY) / view.zoom, rad = -(pinDragData.rotation * Math.PI) / 180;
        let nPX = pinDragData.initialPinX + (dx * Math.cos(rad) - dy * Math.sin(rad)), nPY = pinDragData.initialPinY + (dx * Math.sin(rad) + dy * Math.cos(rad));
        setNotes(prev => prev.map(n => n.id === pinDragData.noteId ? { ...n, pinX: Math.max(0, Math.min(nPX, pinDragData.width)), pinY: Math.max(0, Math.min(nPY, pinDragData.height)) } : n));
        return;
    }
    // 拉伸逻辑 (找回了复杂的模式判断)
    if (resizingId && transformStart) {
        const note = notes.find(n => n.id === resizingId); if(!note) return;
        const dx = (e.clientX - transformStart.mouseX) / view.zoom, dy = (e.clientY - transformStart.mouseY) / view.zoom, rad = -(transformStart.initialRotation * Math.PI) / 180;
        const lDx = dx * Math.cos(rad) - dy * Math.sin(rad), lDy = dx * Math.sin(rad) + dy * Math.cos(rad);
        const LIMITS: any = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 182 }, marker: { w: 30, h: 30 } };
        const min = LIMITS[note.type] || { w: 30, h: 30 };
        let nW = transformStart.initialWidth, nH = transformStart.initialHeight, nX = transformStart.initialX, nY = transformStart.initialY;
        if (transformStart.resizeMode === 'CORNER') {
            const aspect = transformStart.initialWidth / transformStart.initialHeight;
            nW = Math.max(min.w, transformStart.initialWidth + lDx); nH = nW / aspect; if (nH < min.h) { nH = min.h; nW = nH * aspect; }
        } else {
            if (transformStart.resizeMode === 'RIGHT') nW = Math.max(min.w, transformStart.initialWidth + lDx);
            else if (transformStart.resizeMode === 'LEFT') { nW = Math.max(min.w, transformStart.initialWidth - lDx); nX = transformStart.initialX + (transformStart.initialWidth - nW); }
            else if (transformStart.resizeMode === 'BOTTOM') nH = Math.max(min.h, transformStart.initialHeight + lDy);
            else if (transformStart.resizeMode === 'TOP') { nH = Math.max(min.h, transformStart.initialHeight - lDy); nY = transformStart.initialY + (transformStart.initialHeight - nH); }
        }
        setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: nW, height: nH, x: nX, y: nY } : n)); return;
    }
    // 旋转逻辑
    if (rotatingId && transformStart) {
        const deltaX = e.clientX - transformStart.mouseX;
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - (deltaX * 0.5) } : n)); return;
    }
    // 平移逻辑 (鼠标中键或空格键)
    if (isPanning && lastMousePosRef.current) {
        setView(v => ({ ...v, x: v.x + (e.clientX - lastMousePosRef.current!.x), y: v.y + (e.clientY - lastMousePosRef.current!.y) }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY }; return;
    }
    if (connectingNodeId) setMousePos(toWorld(e.clientX, e.clientY));
  }, [draggingId, rotatingId, resizingId, selectionBox, view, notes, selectedIds, transformStart, pinDragData, isPanning, connectingNodeId, toWorld]);

  const handleMouseUp = () => {
    const id = draggingId || resizingId || rotatingId || pinDragData?.noteId;
    if (id) saveToCloud(notes.filter(n => n.id === id || selectedIds.has(n.id)), []);
    setDraggingId(null); setResizingId(null); setRotatingId(null); setSelectionBox(null); setIsPanning(false); setPinDragData(null);
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (isPinMode || connectingNodeId) { setConnectingNodeId(null); setIsPinMode(false); return; }
    if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
    // 滚轮键 (button 1) 或 空格键触发平移
    if (e.button === 1 || isSpacePressed) { 
        e.preventDefault(); setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; 
    }
    else if (e.button === 0) { 
        setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); 
        setSelectedIds(new Set()); 
    }
  };

  // --- 4. 辅助功能函数 ---
  const handleWheel = (e: React.WheelEvent) => { 
    if (ghostNote) { setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + (e.deltaY > 0 ? 1 : -1) + NOTE_TYPES.length) % NOTE_TYPES.length } : null); return; }
    if (editingNodeId) return; 
    const delta = -e.deltaY * 0.001, newZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0), worldMouse = toWorld(e.clientX, e.clientY); 
    setView({ x: e.clientX - worldMouse.x * newZoom, y: e.clientY - worldMouse.y * newZoom, zoom: newZoom }); 
  };

  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex], L: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] }, dims = L[type] || [200, 200];
    const newNode: Note = { id: `n-${Date.now()}`, type, content: type === 'marker' ? (notes.filter(n => n.type === 'marker').length + 1).toString() : 'New Clue', x: ghostNote.x - dims[0]/2, y: ghostNote.y - dims[1]/2, zIndex: maxZIndex + 1, rotation: 0, hasPin: false, width: dims[0], height: dims[1], scale: 1 };
    setNotes(prev => [...prev, newNode]); saveToCloud([newNode], []); setGhostNote(null);
  };

  const addNote = (type: Note['type']) => { setGhostNote({ ...toWorld(window.innerWidth/2, window.innerHeight/2), typeIndex: NOTE_TYPES.indexOf(type) }); };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false); dragCounter.current = 0; 
    const files = Array.from(e.dataTransfer.files) as File[]; const imageFiles = files.filter(file => file.type.startsWith('image/')); 
    if (imageFiles.length === 0) return;
    let currentZ = maxZIndex; const worldPos = toWorld(e.clientX, e.clientY);
    const promises = imageFiles.map(async (file, index) => { 
        const driveFileId = await uploadImage(file); if (!driveFileId) return null; 
        return new Promise<Note>((resolve) => { 
            const img = new Image(); img.src = driveFileId; img.onload = () => { 
                const MAX_W = 300; let fw = img.width, fh = img.height; 
                if (fw > MAX_W) { const r = MAX_W/fw; fw = MAX_W; fh = fh * r; }
                currentZ++; resolve({ id: `ev-${Date.now()}-${index}`, type: 'evidence', content: file.name, fileId: driveFileId, x: worldPos.x + index*20, y: worldPos.y + index*20, zIndex: currentZ, rotation: (Math.random()*10)-5, hasPin: false, width: fw, height: fh, scale: 1, board_id: activeBoardId }); 
            }; 
        }); 
    });
    const loaded = (await Promise.all(promises)).filter(n => n !== null) as Note[];
    if (loaded.length > 0) { setMaxZIndex(currentZ); setNotes(prev => [...prev, ...loaded]); saveToCloud(loaded, []); }
  }, [maxZIndex, toWorld, activeBoardId]);

  // 音频初始化
  useEffect(() => {
    const playBgm = () => { if(audioRef.current) audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {}); window.removeEventListener('click', playBgm); };
    window.addEventListener('click', playBgm);
  }, []);

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden select-none bg-[#A38261] ${isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`} 
         style={{ backgroundImage: `url("${GRID_URL}")`, backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px` }}
         onWheel={handleWheel} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseDown={handleBackgroundMouseDown}
         onDrop={handleDrop} onDragOver={e => e.preventDefault()} onDragEnter={() => { dragCounter.current++; setIsDraggingFile(true); }} onDragLeave={() => { dragCounter.current--; if(dragCounter.current <= 0) setIsDraggingFile(false); }}>
      
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 加载与隐藏提示 UI */}
      {isLoading && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[20001] flex items-center justify-center flex-col gap-4"><Loader2 className="animate-spin text-yellow-500" size={48} /><span className="text-white font-mono tracking-widest">LOADING CASE...</span></div>}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>

      {/* 左上角 UI */}
      {!isUIHidden && (
        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg border border-white/10 shadow-2xl">
            <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 flex items-center gap-2 uppercase tracking-tighter"><FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}</h1>
            <div className="grid grid-cols-2 gap-2 mt-2">
                {NOTE_TYPES.map(t => <button key={t} onClick={() => addNote(t as any)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[10px] font-bold uppercase transition-colors">{t}</button>)}
            </div>
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-red-900/50 hover:bg-red-800'}`}>
              <MapPin size={14} className="inline mr-1"/> {isPinMode ? 'PLACING PIN...' : 'ACTIVATE PIN TOOL'}
            </button>
          </div>

          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg border border-white/10 shadow-2xl flex flex-col gap-2">
            <div className="flex justify-between items-center border-b border-white/10 pb-2"><span className="text-[10px] font-mono text-gray-400 font-bold uppercase">Archives</span><button onClick={async () => { const id=`b-${Date.now()}`, b={id, name:`Case #${boards.length+1}`}; await supabase.from('boards').insert([b]); setBoards([...boards,b]); setActiveBoardId(id); }} className="p-1 hover:bg-yellow-500 rounded text-yellow-500 hover:text-black"><Plus size={14}/></button></div>
            <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
              {boards.map(b => (
                <div key={b.id} onClick={() => setActiveBoardId(b.id)} className={`flex items-center justify-between p-2 rounded group transition-all ${activeBoardId === b.id ? 'bg-yellow-500/20 border border-yellow-500/50' : 'hover:bg-white/5 border border-transparent cursor-pointer'}`}>
                  {renamingBoardId === b.id ? <input autoFocus className="bg-transparent border-b border-yellow-500 outline-none text-xs w-full text-yellow-500" value={editBoardName} onChange={e => setEditBoardName(e.target.value)} onBlur={async () => { await supabase.from('boards').update({ name: editBoardName }).eq('id', renamingBoardId); setBoards(boards.map(x=>x.id===renamingBoardId?{...x,name:editBoardName}:x)); setRenamingBoardId(null); }}/> : <span className={`text-xs truncate ${activeBoardId === b.id ? 'text-yellow-500 font-bold' : 'text-gray-400'}`}>{b.name}</span>}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setRenamingBoardId(b.id); setEditBoardName(b.name); }} className="p-1 text-blue-400 hover:bg-blue-400/20 rounded"><Edit3 size={12}/></button><button onClick={async (e) => { e.stopPropagation(); if(boards.length>1 && window.confirm("Archive case?")) { await supabase.from('boards').delete().eq('id', b.id); const rem=boards.filter(x=>x.id!==b.id); setBoards(rem); if(activeBoardId===b.id) setActiveBoardId(rem[0].id); } }} className="p-1 text-red-400 hover:bg-red-400/20 rounded"><Trash2 size={12}/></button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 右上角 UI */}
      {!isUIHidden && (
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={handleZoomIn} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors"><Plus size={20}/></button>
              <div className="text-[10px] font-mono py-1">{Math.round(view.zoom * 100)}%</div>
              <button onClick={handleZoomOut} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors"><Minus size={20}/></button>
              <button onClick={() => { if(audioRef.current) { if(isMusicPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsMusicPlaying(!isMusicPlaying); } }} className="p-2 hover:bg-white/10">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <button onClick={handleResetView} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl hover:bg-white/10"><LocateFixed size={20}/></button>
            <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl hover:bg-white/10"><Maximize size={20}/></button>
        </div>
      )}

      {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="flex flex-col items-center gap-4 text-white"><UploadCloud size={64} className="text-blue-400"/><h2 className="text-2xl font-bold">UPLOAD EVIDENCE</h2></div></div>}

      {/* 画布核心层 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode key={note.id} note={note} onMouseDown={handleNodeMouseDown} isSelected={selectedIds.has(note.id)} onDoubleClick={() => setEditingNodeId(note.id)} 
                           isPinMode={isPinMode} isConnecting={!!connectingNodeId} isSelectedForConnection={connectingNodeId === note.id}
                           onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: 1, resizeMode: m }); }} 
                           onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
                           onDelete={() => handleDeleteNote(note.id)} />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} 
            onPinMouseDown={(e, id) => {
              e.stopPropagation(); const n = notes.find(x => x.id === id); if(!n) return; const { width, height } = getNoteDimensions(n);
              setPinDragData({ noteId: id, startX: e.clientX, startY: e.clientY, initialPinX: n.pinX || width/2, initialPinY: n.pinY || 10, rotation: n.rotation, width, height });
            }} onPinClick={(e, id) => { e.stopPropagation(); if(!isPinDragRef.current) setConnectingNodeId(connectingNodeId === id ? null : id); }} />
          
          {ghostNote && (() => {
              const t = NOTE_TYPES[ghostNote.typeIndex], s: any = { note:'border-yellow-500 bg-yellow-500/20 text-yellow-500', photo:'border-gray-400 bg-gray-500/20 text-gray-400', dossier:'border-orange-600 bg-orange-600/20 text-orange-600', scrap:'border-stone-400 bg-stone-400/20 text-stone-400', marker:'border-blue-500 bg-blue-500/20 text-blue-500' };
              return (
                <div style={{ position:'absolute', left:ghostNote.x, top:ghostNote.y, transform:'translate(-50%, -50%)', zIndex:20000 }} className="pointer-events-none">
                    <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-2xl backdrop-blur-sm animate-pulse ${s[t]}`}><span className="text-[10px] font-bold uppercase">{t}</span></div>
                </div>
              );
          })()}

          {(draggingId || resizingId || rotatingId || pinDragData) && interactionRef.current.notes.find(n => n.id === (draggingId || resizingId || rotatingId || pinDragData?.noteId)) && (() => {
            const n = interactionRef.current.notes.find(i => i.id === (draggingId || resizingId || rotatingId || pinDragData?.noteId))!;
            let text = `X:${Math.round(n.x)} Y:${Math.round(n.y)}`;
            if (rotatingId) text = `${Math.round(n.rotation)}°`; if (resizingId) text = `W:${Math.round(n.width || 0)} H:${Math.round(n.height || 0)}`; if (pinDragData) text = `Pin: ${Math.round(n.pinX||0)}, ${Math.round(n.pinY||0)}`;
            return <div style={{ position:'absolute', left:n.x, top:n.y-35, width:n.width||200 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none">{text}</div></div>
          })()}
      </div>

      {editingNodeId && notes.find(n=>n.id===editingNodeId) && <EditModal note={notes.find(n=>n.id===editingNodeId)!} onSave={(u) => { setNotes(prev=>prev.map(n=>n.id===u.id?u:n)); setEditingNodeId(null); saveToCloud([u],[]); }} onClose={() => setEditingNodeId(null)} />}
      {selectionBox && <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-[9999]" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
    </div>
  );
};
export default App;