import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection, DragOffset } from './types';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { 
  Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2,
  StickyNote, Image as ImageIcon, Folder, FileText, Crosshair, Layout, FolderKanban
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { uploadImage, deleteImageFromDrive } from './api'; 

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";
type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
interface TransformStartData { mouseX: number; mouseY: number; initialRotation: number; initialWidth: number; initialHeight: number; initialX: number; initialY: number; initialScale: number; resizeMode?: ResizeMode; }
interface PinDragData { noteId: string; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }
interface SelectionBox { startX: number; startY: number; currentX: number; currentY: number; }

// --- 新版增加的接口 ---
interface Board { id: string; name: string; }

const NOTE_TYPES: Note['type'][] = ['note', 'photo', 'dossier', 'scrap', 'marker'];

const App: React.FC = () => {
  // --- 基础状态 ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);
  
  // --- 新版注入的状态 (画板管理) ---
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState("");

  // --- 交互状态 ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // --- Refs ---
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null); 
  const animationFrameRef = useRef<number | null>(null);
  const dragCounter = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // 引用同步 (用于键盘/异步逻辑获取最新状态)
  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId });
  useEffect(() => { 
    interactionRef.current = { draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId]);

  const toWorld = useCallback((screenX: number, screenY: number) => ({ x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }), [view]);

  // --- 1. 数据加载与隔离逻辑 ---
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      // 加载画板列表
      const { data: bData } = await supabase.from('boards').select('*').order('created_at', { ascending: true });
      if (bData && bData.length > 0) {
        setBoards(bData);
        if (!activeBoardId) setActiveBoardId(bData[0].id);
      } else {
        const defaultBoard = { id: `case-${Date.now()}`, name: 'Main Case' };
        await supabase.from('boards').insert([defaultBoard]);
        setBoards([defaultBoard]);
        setActiveBoardId(defaultBoard.id);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (!activeBoardId) return;
    const fetchBoardContent = async () => {
      setIsLoading(true);
      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);
      
      if (nData) {
        setNotes(nData as any);
        const maxZ = nData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
        setMaxZIndex(maxZ);
      }
      if (cData) setConnections(cData as any);
      setIsLoading(false);
    };
    fetchBoardContent();
  }, [activeBoardId]);

  // --- 2. 核心保存/删除函数 (注入 board_id) ---
  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
      const boardId = interactionRef.current.activeBoardId;
      if (changedNotes.length > 0) {
        await supabase.from('notes').upsert(changedNotes.map(n => ({ ...n, board_id: boardId })));
      }
      if (changedConns.length > 0) {
        await supabase.from('connections').upsert(changedConns.map(c => ({ ...c, board_id: boardId })));
      }
  };

  const deleteFromCloud = async (noteId?: string, connId?: string) => {
      if (noteId) await supabase.from('notes').delete().eq('id', noteId);
      if (connId) await supabase.from('connections').delete().eq('id', connId);
  };

  const handleDeleteNote = (id: string) => { 
      const targetNote = notes.find(n => n.id === id);
      if (targetNote?.fileId) deleteImageFromDrive(targetNote.fileId);

      const nextNotes = notes.filter(n => n.id !== id); 
      const nextConns = connections.filter(c => c.sourceId !== id && c.targetId !== id); 
      setNotes(nextNotes); 
      setConnections(nextConns); 
      deleteFromCloud(id); 
      connections.filter(c => c.sourceId === id || c.targetId === id).forEach(c => deleteFromCloud(undefined, c.id)); 
  };

  // --- 3. 键盘全局监听 (合并 Ctrl+U, Space, Delete, GhostKeys) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + U: 切换 UI
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        setIsUIHidden(prev => !prev);
        return;
      }

      // 幽灵模式键盘逻辑
      if (interactionRef.current.ghostNote) {
          if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
              setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + 1) % NOTE_TYPES.length } : null);
              return;
          }
          if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
              setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex - 1 + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
              return;
          }
          if (e.key === 'Enter') { confirmGhostCreation(); return; }
      }

      // 删除键逻辑
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (editingNodeId) return;
          const { connectingNodeId: activeId, selectedIds: currentSelected, notes: currentNotes, connections: currentConns } = interactionRef.current;

          if (activeId) { // 删除图钉关联
              const nextNotes = currentNotes.map(n => n.id === activeId ? { ...n, hasPin: false } : n );
              const nextConns = currentConns.filter(c => c.sourceId !== activeId && c.targetId !== activeId);
              setNotes(nextNotes); setConnections(nextConns); setConnectingNodeId(null);
              saveToCloud([nextNotes.find(n => n.id === activeId)!], []);
              currentConns.filter(c => c.sourceId === activeId || c.targetId === activeId).forEach(c => deleteFromCloud(undefined, c.id));
              return; 
          }

          if (currentSelected.size > 0) { // 批量删除便签
              const idsArray = Array.from(currentSelected);
              idsArray.forEach(id => {
                  const n = currentNotes.find(note => note.id === id);
                  if (n?.fileId) deleteImageFromDrive(n.fileId);
                  deleteFromCloud(id);
              });
              setNotes(currentNotes.filter(n => !currentSelected.has(n.id)));
              setConnections(currentConns.filter(c => !currentSelected.has(c.sourceId) && !currentSelected.has(c.targetId)));
              currentConns.filter(c => currentSelected.has(c.sourceId) || currentSelected.has(c.targetId)).forEach(c => deleteFromCloud(undefined, c.id));
              setSelectedIds(new Set());
          }
      }

      if (e.key === 'Escape') {
        if (interactionRef.current.ghostNote) setGhostNote(null);
        else if (isUIHidden) setIsUIHidden(false);
        else { setConnectingNodeId(null); setIsPinMode(false); setSelectedIds(new Set()); }
      }
      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { setIsSpacePressed(false); setIsPanning(false); } };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [editingNodeId, isUIHidden]); 

  // --- 4. 基础交互逻辑 (拖拽, 缩放, 旋转, 拉伸) ---
  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 
    if (ghostNote) { setGhostNote(null); return; }

    // Pin/Connect 逻辑
    if (isPinMode || connectingNodeId) {
        const target = notes.find(n => n.id === id); if (!target) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rad = -(target.rotation * Math.PI) / 180;
        const { width: w, height: h } = getNoteDimensions(target);
        const pinX = w/2 + (((e.clientX - (rect.left + rect.width/2)) * Math.cos(rad) - (e.clientY - (rect.top + rect.height/2)) * Math.sin(rad)) / view.zoom);
        const pinY = h/2 + (((e.clientX - (rect.left + rect.width/2)) * Math.sin(rad) + (e.clientY - (rect.top + rect.height/2)) * Math.cos(rad)) / view.zoom);

        if (isPinMode) {
          const updated = { ...target, hasPin: true, pinX, pinY };
          setNotes(prev => prev.map(n => n.id === id ? updated : n));
          saveToCloud([updated], []);
        } else if (connectingNodeId && connectingNodeId !== id) {
          const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939' };
          setConnections(prev => [...prev, newConn]);
          saveToCloud([], [newConn]);
          setConnectingNodeId(null);
        }
        return;
    }

    // 选中逻辑
    const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
    if (isMulti) setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    else if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    // 置顶
    const newZ = maxZIndex + 1; setMaxZIndex(newZ);
    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));

    // Alt 复制 (旧版精华)
    if (e.altKey) {
        const target = notes.find(n => n.id === id);
        if (target) {
            const newId = `dup-${Date.now()}`;
            const dup: Note = { ...target, id: newId, zIndex: newZ, x: target.x + 20, y: target.y + 20, hasPin: false };
            setNotes(prev => [...prev, dup]); setDraggingId(newId); setSelectedIds(new Set([newId]));
            lastDragPosRef.current = { x: e.clientX, y: e.clientY };
        }
        return;
    }

    setDraggingId(id); 
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (ghostNote) return;

    if (selectionBox) { // 框选
        const currentX = e.clientX; const currentY = e.clientY;
        setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);
        const wL = (Math.min(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wR = (Math.max(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wT = (Math.min(selectionBox.startY, currentY) - view.y) / view.zoom;
        const wB = (Math.max(selectionBox.startY, currentY) - view.y) / view.zoom;
        const next = new Set<string>();
        notes.forEach(n => { const d = getNoteDimensions(n); if (!(n.x > wR || n.x + d.width < wL || n.y > wB || n.y + d.height < wT)) next.add(n.id); });
        setSelectedIds(next);
        return;
    }

    if (draggingId && lastDragPosRef.current) { // 移动
        const dx = (e.clientX - lastDragPosRef.current.x) / view.zoom;
        const dy = (e.clientY - lastDragPosRef.current.y) / view.zoom;
        setNotes(prev => prev.map(n => (n.id === draggingId || selectedIds.has(n.id)) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
        lastDragPosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }

    if (resizingId && transformStart) { // 拉伸 (包含最小尺寸限制)
        const note = notes.find(n => n.id === resizingId); if(!note) return;
        const worldDx = (e.clientX - transformStart.mouseX) / view.zoom;
        const worldDy = (e.clientY - transformStart.mouseY) / view.zoom;
        const rad = -(transformStart.initialRotation * Math.PI) / 180;
        const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad);
        const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);

        const MINS: any = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 224 }, marker: { w: 30, h: 30 } };
        const min = MINS[note.type] || { w: 50, h: 50 };

        let newW = transformStart.initialWidth; let newH = transformStart.initialHeight;
        let newX = transformStart.initialX; let newY = transformStart.initialY;

        if (transformStart.resizeMode === 'RIGHT') newW = Math.max(min.w, transformStart.initialWidth + localDx);
        else if (transformStart.resizeMode === 'BOTTOM') newH = Math.max(min.h, transformStart.initialHeight + localDy);
        else if (transformStart.resizeMode === 'LEFT') { newW = Math.max(min.w, transformStart.initialWidth - localDx); newX = transformStart.initialX + (transformStart.initialWidth - newW); }
        else if (transformStart.resizeMode === 'TOP') { newH = Math.max(min.h, transformStart.initialHeight - localDy); newY = transformStart.initialY + (transformStart.initialHeight - newH); }
        else if (transformStart.resizeMode === 'CORNER') {
            const ratio = transformStart.initialWidth / transformStart.initialHeight;
            newW = Math.max(min.w, transformStart.initialWidth + ((-localDx + localDy * ratio) / 2));
            newH = newW / ratio;
            if (newH < min.h) { newH = min.h; newW = newH * ratio; }
            newX = transformStart.initialX - (newW - transformStart.initialWidth)/2;
            newY = transformStart.initialY - (newH - transformStart.initialHeight)/2;
        }
        setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newW, height: newH, x: newX, y: newY, scale: ['note','dossier','scrap'].includes(n.type) ? (newW / (transformStart.initialWidth/transformStart.initialScale)) : n.scale } : n));
        return;
    }

    if (rotatingId && transformStart) {
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - ((e.clientX - transformStart.mouseX) * 0.5) } : n));
        return;
    }

    if (isPanning && lastMousePosRef.current) {
        setView(prev => ({ ...prev, x: prev.x + (e.clientX - lastMousePosRef.current!.x), y: prev.y + (e.clientY - lastMousePosRef.current!.y) }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
    }
    if (connectingNodeId) setMousePos(toWorld(e.clientX, e.clientY));
  }, [isPanning, draggingId, resizingId, rotatingId, selectionBox, view, notes, selectedIds, transformStart, connectingNodeId, ghostNote]);

  const handleMouseUp = () => {
    if (draggingId || resizingId || rotatingId) {
        const ids = new Set([draggingId || resizingId || rotatingId, ...Array.from(selectedIds)]);
        saveToCloud(notes.filter(n => ids.has(n.id)), []);
    }
    setDraggingId(null); setRotatingId(null); setResizingId(null); setSelectionBox(null); setIsPanning(false);
  };

  // --- 5. 拖拽文件上传 (旧版精华) ---
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false); dragCounter.current = 0;
    const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let currentZ = maxZIndex; const worldPos = toWorld(e.clientX, e.clientY);
    const promises = imageFiles.map(async (file, i) => {
        const driveId = await uploadImage(file); if (!driveId) return null;
        return new Promise<Note>(res => {
            const img = new Image(); img.src = driveId;
            img.onload = () => {
                let w = img.width; let h = img.height;
                if (w > 300) { h = h * (300/w); w = 300; }
                currentZ++;
                res({ id: `ev-${Date.now()}-${i}`, type: 'photo', content: file.name, fileId: driveId, x: worldPos.x - w/2 + i*20, y: worldPos.y - h/2 + i*20, zIndex: currentZ, rotation: (Math.random()*10)-5, hasPin: false, width: w, height: h, scale: 1 });
            };
        });
    });
    const loaded = (await Promise.all(promises)).filter(n => n !== null) as Note[];
    if (loaded.length > 0) { setMaxZIndex(currentZ); setNotes(prev => [...prev, ...loaded]); saveToCloud(loaded, []); }
  }, [maxZIndex, toWorld, notes]);

  // --- 6. 画板管理函数 (新版增加) ---
  const handleAddBoard = async () => {
    const newBoard = { id: `board-${Date.now()}`, name: `New Case #${boards.length + 1}` };
    await supabase.from('boards').insert([newBoard]);
    setBoards([...boards, newBoard]); setActiveBoardId(newBoard.id);
  };

  const handleSaveBoardName = async () => {
    if (!renamingBoardId) return;
    await supabase.from('boards').update({ name: editBoardName }).eq('id', renamingBoardId);
    setBoards(boards.map(b => b.id === renamingBoardId ? { ...b, name: editBoardName } : b));
    setRenamingBoardId(null);
  };

  const handleDeleteBoard = async (id: string) => {
    if (boards.length <= 1 || !window.confirm("Archive this case? All linked evidence will be lost.")) return;
    await supabase.from('boards').delete().eq('id', id);
    const rem = boards.filter(b => b.id !== id);
    setBoards(rem); if (activeBoardId === id) setActiveBoardId(rem[0].id);
  };

  // --- 7. 幽灵模式创建 ---
  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    const LIMITS: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] };
    const [w, h] = LIMITS[type] || [200, 200];
    const newNote: Note = { id: `n-${Date.now()}`, type, content: 'New Clue', x: ghostNote.x - w/2, y: ghostNote.y - h/2, zIndex: maxZIndex + 1, rotation: 0, hasPin: false, width: w, height: h, scale: 1 };
    setNotes(prev => [...prev, newNote]); setMaxZIndex(prev => prev + 1);
    saveToCloud([newNote], []); setGhostNote(null);
  };

  // --- 8. 音频逻辑 (旧版自动播放补丁) ---
  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current && !isMusicPlaying) {
        audioRef.current.volume = 0.3;
        audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {});
        window.removeEventListener('click', playBgm);
      }
    };
    window.addEventListener('click', playBgm);
    return () => window.removeEventListener('click', playBgm);
  }, [isMusicPlaying]);

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden bg-[#A38261] select-none ${isSpacePressed ? 'cursor-grab' : ''}`}
         style={{ backgroundImage: `url("${GRID_URL}")`, backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px` }}
         onWheel={(e) => {
            if (ghostNote) { 
              const dir = e.deltaY > 0 ? 1 : -1;
              setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + dir + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
            } else if (!editingNodeId) {
              const delta = -e.deltaY * 0.001; const nextZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0);
              const m = toWorld(e.clientX, e.clientY);
              setView({ x: e.clientX - m.x * nextZoom, y: e.clientY - m.y * nextZoom, zoom: nextZoom });
            }
         }}
         onMouseDown={(e) => {
            if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
            if (e.button === 1 || isSpacePressed) { setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
            else if (e.button === 0 && e.target === boardRef.current) { 
              setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); 
              setSelectedIds(new Set()); setConnectingNodeId(null);
            }
         }}
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
         onDoubleClick={(e) => { if(e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}
         onDragEnter={() => { dragCounter.current++; setIsDraggingFile(true); }}
         onDragLeave={() => { dragCounter.current--; if(dragCounter.current === 0) setIsDraggingFile(false); }}
         onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      
      <style>{`.animate-dash { stroke-dasharray: 8 4 !important; }`}</style>
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 🟢 左侧：画板列表 + 工具栏 (合并新旧版) */}
      {!isUIHidden && (
        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10">
            <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 flex items-center gap-2 uppercase">
              <FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}
            </h1>
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {isPinMode ? 'FINISH PINNING' : 'ACTIVATE PIN TOOL'}
            </button>
          </div>

          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10 flex flex-col gap-2">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-[10px] font-mono tracking-widest text-gray-400 uppercase font-bold">Archives</span>
              <button onClick={handleAddBoard} className="p-1 hover:bg-yellow-500 rounded text-yellow-500 hover:text-black"><Plus size={14} /></button>
            </div>
            <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
              {boards.map(b => (
                <div key={b.id} onClick={() => setActiveBoardId(b.id)}
                     className={`flex items-center justify-between p-2 rounded group transition-all ${activeBoardId === b.id ? 'bg-yellow-500/20 border border-yellow-500/50' : 'hover:bg-white/5 border border-transparent cursor-pointer'}`}>
                  {renamingBoardId === b.id ? (
                    <input autoFocus className="bg-transparent border-b border-yellow-500 outline-none text-xs w-full text-yellow-500" value={editBoardName} 
                           onChange={e => setEditBoardName(e.target.value)} onBlur={handleSaveBoardName} onKeyDown={e => e.key === 'Enter' && handleSaveBoardName()}/>
                  ) : (
                    <span className={`text-xs truncate ${activeBoardId === b.id ? 'text-yellow-500 font-bold' : 'text-gray-400'}`}>{b.name}</span>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingBoardId(b.id); setEditBoardName(b.name); }} className="p-1 text-blue-400 hover:bg-blue-400/20 rounded"><FileText size={12}/></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id); }} className="p-1 text-red-400 hover:bg-red-400/20 rounded"><Trash2 size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🟡 右上角：视图控制 */}
      {!isUIHidden && (
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={() => setView(v => ({...v, zoom: Math.min(v.zoom+0.1, 3)}))} className="p-2 border-b border-white/10 hover:bg-white/10"><Plus size={20}/></button>
              <div className="text-[10px] font-mono py-1">{Math.round(view.zoom * 100)}%</div>
              <button onClick={() => setView(v => ({...v, zoom: Math.max(v.zoom-0.1, 0.1)}))} className="p-2 border-b border-white/10 hover:bg-white/10"><Minus size={20}/></button>
              <button onClick={() => { if(audioRef.current) isMusicPlaying ? audioRef.current.pause() : audioRef.current.play(); setIsMusicPlaying(!isMusicPlaying); }} className="p-2 hover:bg-white/10 transition-colors">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={() => setView({ x: 0, y: 0, zoom: 1 })} className="p-2 border-b border-white/10 hover:bg-white/10" title="Reset View"><LocateFixed size={20}/></button>
              <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="p-2 hover:bg-white/10 transition-colors" title="Hide UI (Ctrl+U)"><Maximize size={20}/></button>
            </div>
        </div>
      )}

      {/* 🔵 画布层 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode key={note.id} note={note} onMouseDown={handleNodeMouseDown} isSelected={selectedIds.has(note.id)} 
                           onDoubleClick={() => setEditingNodeId(note.id)} 
                           onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: note.scale || 1, resizeMode: m }); }} 
                           onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
                           onDelete={() => handleDeleteNote(note.id)} />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} />
          
          {/* Ghost 预览层 */}
          {ghostNote && (() => {
              const t = NOTE_TYPES[ghostNote.typeIndex];
              const s: any = { note: 'border-yellow-500 bg-yellow-500/20 text-yellow-500', photo: 'border-gray-400 bg-gray-500/20 text-gray-400', dossier: 'border-orange-600 bg-orange-600/20 text-orange-600', scrap: 'border-stone-400 bg-stone-400/20 text-stone-400', marker: 'border-blue-500 bg-blue-500/20 text-blue-500' };
              return (
                <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000 }} className="pointer-events-none">
                    <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl backdrop-blur-sm animate-pulse ${s[t]}`}>
                        {t === 'note' && <StickyNote size={40}/>} {t === 'photo' && <ImageIcon size={40}/>} {t === 'dossier' && <Folder size={40}/>} {t === 'scrap' && <FileText size={40}/>} {t === 'marker' && <MapPin size={40}/>}
                        <span className="text-[10px] font-bold mt-1 uppercase">{t}</span>
                    </div>
                </div>
              );
          })()}

          {/* 实时数值覆盖层 */}
          {(draggingId || resizingId || rotatingId) && (() => {
            const n = notes.find(i => i.id === (draggingId || resizingId || rotatingId));
            if (!n) return null;
            let label = draggingId ? `X:${Math.round(n.x)} Y:${Math.round(n.y)}` : rotatingId ? `${Math.round(n.rotation)}°` : `W:${Math.round(n.width || 0)} H:${Math.round(n.height || 0)}`;
            return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 200 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">{label}</div></div>
          })()}
      </div>

      {/* 🔴 全局 UI 层 */}
      {isLoading && <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10001]"><Loader2 className="animate-spin text-yellow-400" size={48}/></div>}
      {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce"><UploadCloud size={64} className="text-blue-400"/><h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2></div></div>}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>

      {editingNodeId && notes.find(n=>n.id===editingNodeId) && <EditModal note={notes.find(n=>n.id===editingNodeId)!} onSave={handleSaveNote} onClose={() => setEditingNodeId(null)} />}
      {selectionBox && <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY), zIndex: 9999 }} />}
    </div>
  );
};

export default App;