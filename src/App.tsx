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
// 🟢 引入 API 功能：确保能上传和删除 Drive 图片
import { uploadImage, deleteImageFromDrive } from './api'; 

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";
type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
interface TransformStartData { mouseX: number; mouseY: number; initialRotation: number; initialWidth: number; initialHeight: number; initialX: number; initialY: number; initialScale: number; resizeMode?: ResizeMode; }
interface PinDragData { noteId: string; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }
interface SelectionBox { startX: number; startY: number; currentX: number; currentY: number; }

// 🟢 画板类型定义
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
  
  // 🟢 画板状态 (来自新版)
  const [boards, setBoards] = useState<Board[]>([]);
  // 🟢 默认为 v1，确保数据对齐
  const [activeBoardId, setActiveBoardId] = useState<string>('v1'); 
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState("");

  // 交互状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [transformStart, setTransformStart] = useState<TransformStartData | null>(null);
  const [pinDragData, setPinDragData] = useState<PinDragData | null>(null);
  const isPinDragRef = useRef(false); // 来自原版，防止拖拽误触点击
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isPinMode, setIsPinMode] = useState<boolean>(false);
  const [isUIHidden, setIsUIHidden] = useState<boolean>(true); 
  const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
  
  // 幽灵模式与拖拽上传 (保留原版丰富功能)
  const [ghostNote, setGhostNote] = useState<{ x: number; y: number; typeIndex: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  
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

  // --- 1. 快捷键监听 (保留原版的 Arrow Key 切换 ghostNote) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+U 切换 UI
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        const nextHiddenState = !interactionRef.current.isUIHidden;
        setIsUIHidden(nextHiddenState);
        if (nextHiddenState) setShowHiddenModeToast(true);
        return;
      }

      // 幽灵模式方向键切换 (原版功能)
      if (interactionRef.current.ghostNote) {
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

      // 删除键 (包含 Drive 删除逻辑)
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (editingNodeId) return;
          const { selectedIds: currentSelected, notes: currentNotes } = interactionRef.current;
          
          if (currentSelected.size > 0) {
              const idsArray = Array.from(currentSelected);
              idsArray.forEach(id => handleDeleteNote(id)); // 复用 handleDeleteNote 以触发 Drive 删除
              setSelectedIds(new Set());
          }
      }

      if (e.key === 'Escape') {
        if (interactionRef.current.ghostNote) { setGhostNote(null); return; }
        if (interactionRef.current.isUIHidden) setIsUIHidden(false);
        else { setConnectingNodeId(null); setIsPinMode(false); setSelectionBox(null); }
      }
      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { setIsSpacePressed(false); setIsPanning(false); }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [editingNodeId]); // 依赖 editingNodeId 防止输入时误删

  // --- 2. 缩放与视图 ---
  const handleZoomIn = () => setView(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 3.0) }));
  const handleZoomOut = () => setView(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.1) }));
  const handleResetView = () => setView({ x: 0, y: 0, zoom: 1 });

  // --- 3. 数据加载 (支持多画板过滤) ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      // 加载画板列表
      const { data: bData } = await supabase.from('boards').select('*').order('updated_at', { ascending: true });
      if (bData && bData.length > 0) setBoards(bData);
      else {
        // 🟢 默认创建 v1 画板
        const def = { id: 'v1', name: 'Version 1' };
        await supabase.from('boards').insert([def]);
        setBoards([def]);
      }

      // 加载当前画板内容
      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);
      
      setNotes(nData ? (nData as any) : []);
      if (nData) {
        const maxZ = nData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
        setMaxZIndex(maxZ);
      }
      setConnections(cData ? (cData as any) : []);
      setIsLoading(false);
    };
    fetchInitialData();

    // 实时订阅 (过滤 activeBoardId)
    const channel = supabase.channel(`board-${activeBoardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
          if (payload.eventType === 'INSERT') setNotes(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new as Note]);
          else if (payload.eventType === 'UPDATE') setNotes(prev => prev.map(n => n.id === payload.new.id ? (payload.new as Note) : n));
          else if (payload.eventType === 'DELETE') setNotes(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
          if (payload.eventType === 'INSERT') setConnections(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new as Connection]);
          else if (payload.eventType === 'UPDATE') setConnections(prev => prev.map(c => c.id === payload.new.id ? (payload.new as Connection) : c));
          else if (payload.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [activeBoardId]);

  // --- 4. 核心保存与删除 (包含 Drive 联动) ---
  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
      // 🟢 关键：保存时注入 activeBoardId
      if (changedNotes.length > 0) await supabase.from('notes').upsert(changedNotes.map(n => ({ ...n, board_id: activeBoardId })));
      if (changedConns.length > 0) await supabase.from('connections').upsert(changedConns.map(c => ({ ...c, board_id: activeBoardId })));
  };

  const deleteFromCloud = async (noteId?: string, connId?: string) => {
      if (noteId) await supabase.from('notes').delete().eq('id', noteId);
      if (connId) await supabase.from('connections').delete().eq('id', connId);
  };

  const handleDeleteNote = (id: string) => {
    if (connectingNodeId === id) setConnectingNodeId(null);
    
    // 🟢 保留原版逻辑：删除 Google Drive 图片
    const target = notes.find(n => n.id === id);
    if (target?.fileId) {
        console.log("Deleting linked file:", target.fileId);
        deleteImageFromDrive(target.fileId);
    }

    setNotes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    deleteFromCloud(id);
    
    // 清理相关连线
    const relatedConns = connections.filter(c => c.sourceId === id || c.targetId === id);
    relatedConns.forEach(c => deleteFromCloud(undefined, c.id));
  };

  const handleSaveNote = (updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    setEditingNodeId(null);
    saveToCloud([updatedNote], []);
  };

  // --- 5. 交互函数 (拖拽/连线/Ghost) ---
  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 
    if (ghostNote) { setGhostNote(null); return; }

    if (isPinMode || connectingNodeId) {
        const target = notes.find(n => n.id === id); if (!target) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const rad = -(target.rotation * Math.PI) / 180;
        const { width: w, height: h } = getNoteDimensions(target);
        const pinX = w/2 + ((dx * Math.cos(rad) - dy * Math.sin(rad)) / view.zoom);
        const pinY = h/2 + ((dx * Math.sin(rad) + dy * Math.cos(rad)) / view.zoom);

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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (ghostNote) return;

    if (selectionBox) {
        const currentX = e.clientX; const currentY = e.clientY;
        setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);
        // ... (选框逻辑简略，保持原版逻辑)
        const wL = (Math.min(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wR = (Math.max(selectionBox.startX, currentX) - view.x) / view.zoom;
        const wT = (Math.min(selectionBox.startY, currentY) - view.y) / view.zoom;
        const wB = (Math.max(selectionBox.startY, currentY) - view.y) / view.zoom;
        const newSelected = new Set<string>();
        notes.forEach(n => {
            const d = getNoteDimensions(n);
            const noteRight = n.x + (d.width || 200);
            const noteBottom = n.y + (d.height || 200);
            if (!(n.x > wR || noteRight < wL || n.y > wB || noteBottom < wT)) newSelected.add(n.id);
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

    // 🟢 保留原版的高级拉伸逻辑 (含宽高比限制)
    if (resizingId && transformStart) {
        const note = notes.find(n => n.id === resizingId); if(!note) return;
        const mode = transformStart.resizeMode;
        const dx = (e.clientX - transformStart.mouseX) / view.zoom;
        const dy = (e.clientY - transformStart.mouseY) / view.zoom;
        const rad = -(transformStart.initialRotation * Math.PI) / 180;
        const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

        const MIN_DIMENSIONS: Record<string, { w: number, h: number }> = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 224 }, marker: { w: 30, h: 30 } };
        const limits = MIN_DIMENSIONS[note.type] || { w: 50, h: 50 };

        if (mode === 'CORNER') { 
            const aspectRatio = transformStart.initialWidth / transformStart.initialHeight; 
            const avgChange = (-localDx + localDy * aspectRatio) / 2; 
            let newW = Math.max(limits.w, transformStart.initialWidth + avgChange); 
            let newH = newW / aspectRatio;
            if (newH < limits.h) { newH = limits.h; newW = newH * aspectRatio; }
            const wChange = newW - transformStart.initialWidth;
            const hChange = newH - transformStart.initialHeight;
            // 只有特定类型更新 scale
            setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newW, height: newH, x: transformStart.initialX - (wChange/2), y: transformStart.initialY - (hChange/2), scale: ['note','dossier','scrap'].includes(n.type) ? (newW/(transformStart.initialWidth/transformStart.initialScale)) : n.scale } : n)); 
        } else {
             let newW = transformStart.initialWidth; let newH = transformStart.initialHeight; let newX = transformStart.initialX; let newY = transformStart.initialY;
             if (mode === 'LEFT') { newW = Math.max(limits.w, transformStart.initialWidth - localDx); newX = transformStart.initialX + (transformStart.initialWidth - newW); }
             else if (mode === 'RIGHT') newW = Math.max(limits.w, transformStart.initialWidth + localDx);
             else if (mode === 'TOP') { newH = Math.max(limits.h, transformStart.initialHeight - localDy); newY = (transformStart.initialY + transformStart.initialHeight) - newH; }
             else if (mode === 'BOTTOM') newH = Math.max(limits.h, transformStart.initialHeight + localDy);
             setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newW, height: newH, x: newX, y: newY } : n));
        }
        return;
    }

    if (rotatingId && transformStart) {
        const deltaX = e.clientX - transformStart.mouseX;
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - (deltaX * 0.5) } : n));
    }
    
    if (connectingNodeId) setMousePos(toWorld(e.clientX, e.clientY));
  }, [draggingId, resizingId, rotatingId, selectionBox, view, notes, selectedIds, transformStart, connectingNodeId, toWorld, ghostNote]);

  const handleMouseUp = () => {
    if (draggingId || resizingId || rotatingId) {
      const changed = notes.filter(n => n.id === (draggingId || resizingId || rotatingId) || selectedIds.has(n.id));
      saveToCloud(changed, []);
    }
    setDraggingId(null); setResizingId(null); setRotatingId(null); setSelectionBox(null); setIsPanning(false); isPinDragRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => { 
    if (ghostNote) {
      const dir = e.deltaY > 0 ? 1 : -1;
      setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + dir + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
      return;
    }
    if (editingNodeId) return; 
    const delta = -e.deltaY * 0.001; 
    const newZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0); 
    const worldMouse = toWorld(e.clientX, e.clientY); 
    setView({ x: e.clientX - worldMouse.x * newZoom, y: e.clientY - worldMouse.y * newZoom, zoom: newZoom }); 
  };

  // --- 6. 音频逻辑 (保留原版的交互激活逻辑) ---
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = 0.2;
        audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {
            const enableAudio = () => { if(audioRef.current) { audioRef.current.play(); setIsMusicPlaying(true); window.removeEventListener('click', enableAudio); } };
            window.addEventListener('click', enableAudio);
        });
    }
  }, []);
  const toggleMusic = () => { if (audioRef.current) { if (isMusicPlaying) { audioRef.current.pause(); setIsMusicPlaying(false); } else { audioRef.current.play(); setIsMusicPlaying(true); } } };

  // --- 7. 辅助功能 (Ghost, DragDrop, Board) ---
  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    const LIMITS: any = { note: {w:256, h:160}, photo: {w:256, h:280}, dossier: {w:256, h:224}, scrap: {w:257, h:50}, marker: {w:30, h:30} };
    const dims = LIMITS[type] || {w:200, h:200};
    const newNote: Note = { id: `n-${Date.now()}`, type, content: type==='photo'?'Evidence':'New Clue', x: ghostNote.x - dims.w/2, y: ghostNote.y - dims.h/2, zIndex: maxZIndex + 1, rotation: (Math.random()*10)-5, hasPin: false, width: dims.w, height: dims.h, scale: 1, fileId: type==='photo'?'/photo_1.png':undefined };
    setNotes([...notes, newNote]);
    saveToCloud([newNote], []);
    setGhostNote(null);
  };

  const addNote = (type: Note['type']) => { // 左侧栏按钮使用
      const center = toWorld(window.innerWidth/2, window.innerHeight/2);
      setGhostNote({ x: center.x, y: center.y, typeIndex: NOTE_TYPES.indexOf(type) });
      // 触发后直接进入 Ghost 模式，让用户放置
  };

  const handleAddBoard = async () => {
    const newId = `board-${Date.now()}`;
    const newBoard = { id: newId, name: `New Case #${boards.length + 1}` };
    await supabase.from('boards').insert([newBoard]);
    setBoards([...boards, newBoard]);
    setActiveBoardId(newId);
  };

  const handleDeleteBoard = async (id: string) => {
    if (boards.length <= 1) return;
    if (window.confirm("Archiving this case will erase all linked clues. Confirm?")) {
      await supabase.from('boards').delete().eq('id', id);
      const rem = boards.filter(b => b.id !== id);
      setBoards(rem);
      if (activeBoardId === id) setActiveBoardId(rem[0].id);
    }
  };

  const handleSaveBoardName = async () => {
    if (!renamingBoardId) return;
    await supabase.from('boards').update({ name: editBoardName }).eq('id', renamingBoardId);
    setBoards(boards.map(b => b.id === renamingBoardId ? { ...b, name: editBoardName } : b));
    setRenamingBoardId(null);
  };

  // 🟢 保留原版的文件拖拽上传逻辑
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current += 1; if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDraggingFile(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false); dragCounter.current = 0; 
    const files = Array.from(e.dataTransfer.files) as File[]; const imageFiles = files.filter(file => file.type.startsWith('image/')); 
    if (imageFiles.length === 0) return;
    
    let currentZ = maxZIndex; const worldPos = toWorld(e.clientX, e.clientY);
    const promises = imageFiles.map(async (file, index) => { 
        const driveFileId = await uploadImage(file); 
        if (!driveFileId) return null; 
        return new Promise<Note>((resolve) => { 
            const img = new Image(); img.src = driveFileId; 
            img.onload = () => { 
                const MAX_W = 300; let fw = img.width; let fh = img.height; 
                if (fw > MAX_W) { const r = MAX_W/fw; fw = MAX_W; fh = fh * r; }
                currentZ++; 
                resolve({ id: `ev-${Date.now()}-${index}`, type: 'evidence', content: file.name, fileId: driveFileId, x: worldPos.x + index*20, y: worldPos.y + index*20, zIndex: currentZ, rotation: (Math.random()*10)-5, hasPin: false, width: fw, height: fh, scale: 1, board_id: activeBoardId }); 
            }; 
        }); 
    });
    const loaded = (await Promise.all(promises)).filter(n => n !== null) as Note[];
    if (loaded.length > 0) { setMaxZIndex(currentZ); setNotes(prev => [...prev, ...loaded]); saveToCloud(loaded, []); }
  }, [maxZIndex, toWorld, activeBoardId]); // 依赖 activeBoardId 确保上传到正确画板

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden select-none ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`} 
         style={{ backgroundImage: `url("${GRID_URL}"), linear-gradient(180deg, #A38261 22.65%, #977049 100%)`, backgroundPosition: `${view.x}px ${view.y}px, 0 0`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px, 100% 100%`, backgroundRepeat: 'repeat, no-repeat', backgroundColor: '#A38261' }} 
         onWheel={handleWheel} 
         onMouseDown={(e) => {
           if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
           if (e.button === 1 || isSpacePressed) { setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
           else if (e.button === 0) { setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); setSelectedIds(new Set()); }
         }} 
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
         onDoubleClick={(e) => { if(e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}
         onDrop={handleDrop} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver}>
      
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 🟢 左上角：融合了工具集 + 画板列表 */}
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
            </div>
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
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
                    <button onClick={(e) => { e.stopPropagation(); setRenamingBoardId(b.id); setEditBoardName(b.name); }} className="p-1 text-blue-400 hover:bg-blue-400/20 rounded"><Edit3 size={12}/></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBoard(b.id); }} className="p-1 text-red-400 hover:bg-red-400/20 rounded"><Trash2 size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 右上角控制 */}
      {!isUIHidden && (
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={handleZoomIn} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors"><Plus size={20}/></button>
              <div className="text-[10px] font-mono py-1">{Math.round(view.zoom * 100)}%</div>
              <button onClick={handleZoomOut} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors"><Minus size={20}/></button>
              <button onClick={toggleMusic} className="p-2 hover:bg-white/10 transition-colors">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={handleResetView} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors" title="Reset View"><LocateFixed size={20}/></button>
              <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="p-2 hover:bg-white/10 transition-colors" title="Hide UI (Ctrl+U)"><Maximize size={20}/></button>
            </div>
        </div>
      )}
      
      {/* 🟢 拖拽上传覆盖层 */}
      {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce"><UploadCloud size={64} className="text-blue-400"/><h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2></div></div>}

      {/* 画布核心 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode key={note.id} note={note} onMouseDown={handleNodeMouseDown} isSelected={selectedIds.has(note.id)} 
                           onDoubleClick={() => setEditingNodeId(note.id)} onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: 1, resizeMode: m }); }} 
                           onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
                           onDelete={() => handleDeleteNote(note.id)} 
                           onStartPin={() => { setIsPinMode(true); }} />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} />
          
          {/* 🟢 幽灵模式预览 (使用原版精致 UI) */}
          {ghostNote && (() => {
              const t = NOTE_TYPES[ghostNote.typeIndex];
              const s: any = { note: {c:'border-yellow-500 bg-yellow-500/20 text-yellow-500', i:<StickyNote size={40}/>}, photo: {c:'border-gray-400 bg-gray-500/20 text-gray-400', i:<ImageIcon size={40}/>}, dossier: {c:'border-orange-600 bg-orange-600/20 text-orange-600', i:<Folder size={40}/>}, scrap: {c:'border-stone-400 bg-stone-400/20 text-stone-400', i:<FileText size={40}/>}, marker: {c:'border-blue-500 bg-blue-500/20 text-blue-500', i:<MapPin size={40}/>} };
              const st = s[t] || s.note;
              return (
                <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000 }} className="pointer-events-none">
                    <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl backdrop-blur-sm animate-pulse ${st.c}`}>
                        {st.i}
                        <span className="text-[10px] font-bold mt-1 uppercase">{t}</span>
                    </div>
                    <div className="mt-2 text-white/50 text-[10px] font-mono text-center flex justify-center items-center gap-1"><MousePointer2 size={10}/> ARROWS / SCROLL</div>
                </div>
              );
          })()}

          {/* 数值覆盖层 */}
          {(draggingId || resizingId) && interactionRef.current.notes.find(n => n.id === (draggingId || resizingId)) && (() => {
            const n = interactionRef.current.notes.find(i => i.id === (draggingId || resizingId))!;
            return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 200 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">W:{Math.round(n.width || 0)} H:{Math.round(n.height || 0)}</div></div>
          })()}
      </div>

      {isLoading && <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[10001]"><Loader2 className="animate-spin text-yellow-400" size={48}/></div>}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>

      {editingNodeId && notes.find(n=>n.id===editingNodeId) && <EditModal note={notes.find(n=>n.id===editingNodeId)!} onSave={handleSaveNote} onClose={() => setEditingNodeId(null)} />}
      {selectionBox && <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
    </div>
  );
};

export default App;