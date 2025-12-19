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
  
  // 🟢 音乐状态
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null); 
  const boardRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode });
  useEffect(() => { 
    interactionRef.current = { draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden, ghostNote, connectingNodeId, isPinMode]);
  
  const toWorld = useCallback((screenX: number, screenY: number) => ({ x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }), [view]);

  // --- 音乐控制逻辑 ---
  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(err => console.log("播放失败:", err));
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.2;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setIsMusicPlaying(true)).catch(() => {
          const enableAudio = () => {
            if (audioRef.current) {
              audioRef.current.play().then(() => setIsMusicPlaying(true));
              window.removeEventListener('click', enableAudio);
              window.removeEventListener('keydown', enableAudio);
            }
          };
          window.addEventListener('click', enableAudio);
          window.addEventListener('keydown', enableAudio);
        });
      }
    }
  }, []);

  // --- 交互核心逻辑 ---
  const handleZoomIn = () => setView(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 3.0) }));
  const handleZoomOut = () => setView(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.1) }));
  const handleResetView = () => setView({ x: 0, y: 0, zoom: 1 });

  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    const L: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] };
    const dims = L[type] || [200, 200];
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

  // --- 1. 快捷键监听 ---
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
  }, [isUIHidden]);

  // --- 2. 数据处理逻辑 ---
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

  const handleSaveNote = (updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    setEditingNodeId(null);
    saveToCloud([updatedNote], []);
  };

  // --- 3. 核心交互逻辑：图钉与点击 ---
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
    if (connectingNodeId === id) setConnectingNodeId(null);
    else setConnectingNodeId(id);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; 
    e.stopPropagation(); 
    if (ghostNote) { setGhostNote(null); return; }

    // 🟢 修复重点：图钉创建与连线逻辑置顶
    const isConnecting = connectingNodeId && connectingNodeId !== id;
    
    if (isPinMode || isConnecting) {
        const target = notes.find(n => n.id === id); 
        if (!target) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const rad = -(target.rotation * Math.PI) / 180;
        const { width: w, height: h } = getNoteDimensions(target);
        
        // 计算点击位置相对于卡片中心的局部坐标
        const clickDX = e.clientX - (rect.left + rect.width / 2);
        const clickDY = e.clientY - (rect.top + rect.height / 2);
        
        const pinX = w / 2 + (clickDX * Math.cos(rad) - clickDY * Math.sin(rad)) / view.zoom;
        const pinY = h / 2 + (clickDX * Math.sin(rad) + clickDY * Math.cos(rad)) / view.zoom;
        
        const updatedTarget = { ...target, hasPin: true, pinX, pinY };

        if (isConnecting) {
            const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId!, targetId: id, color: '#D43939' };
            setNotes(prev => prev.map(n => n.id === id ? updatedTarget : n));
            setConnections(prev => [...prev, newConn]);
            saveToCloud([updatedTarget], [newConn]);
            setConnectingNodeId(null);
        } else {
            setNotes(prev => prev.map(n => n.id === id ? updatedTarget : n));
            saveToCloud([updatedTarget], []);
        }
        
        setIsPinMode(false); // 放置后自动退出模式
        return;
    }

    // Alt + 左键复制逻辑
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

    const isMulti = e.ctrlKey || e.shiftKey;
    if (isMulti) setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    else if (!selectedIds.has(id)) setSelectedIds(new Set([id]));

    const newZ = maxZIndex + 1; setMaxZIndex(newZ);
    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));
    setDraggingId(id); 
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

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
  }, [draggingId, rotatingId, selectionBox, view, notes, selectedIds, transformStart, pinDragData, isPanning, connectingNodeId, toWorld]);

  const handleMouseUp = () => {
    const id = draggingId || resizingId || rotatingId || pinDragData?.noteId;
    if (id) saveToCloud(notes.filter(n => n.id === id || selectedIds.has(n.id)), []);
    setDraggingId(null); setResizingId(null); setRotatingId(null); setSelectionBox(null); setIsPanning(false); setPinDragData(null);
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (isPinMode || connectingNodeId) { setConnectingNodeId(null); setIsPinMode(false); return; }
    if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
    if (e.button === 1 || isSpacePressed) { e.preventDefault(); setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
    else if (e.button === 0) { setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); setSelectedIds(new Set()); }
  };

  const addNote = (type: Note['type']) => {
      const center = toWorld(window.innerWidth/2, window.innerHeight/2);
      setGhostNote({ x: center.x, y: center.y, typeIndex: NOTE_TYPES.indexOf(type) });
  };

  // --- 4. 画板管理逻辑 ---
  const handleAddBoard = async () => {
    const newId = `board-${Date.now()}`;
    const newBoard = { id: newId, name: `New Case #${boards.length + 1}` };
    await supabase.from('boards').insert([newBoard]);
    setBoards([...boards, newBoard]);
    setActiveBoardId(newId);
  };

  const handleSaveBoardName = async () => {
    if (!renamingBoardId) return;
    await supabase.from('boards').update({ name: editBoardName }).eq('id', renamingBoardId);
    setBoards(boards.map(b => b.id === renamingBoardId ? { ...b, name: editBoardName } : b));
    setRenamingBoardId(null);
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

  return (
    <div ref={boardRef} className={`w-screen h-screen relative overflow-hidden select-none ${isSpacePressed || isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`} 
         style={{ 
           backgroundColor: '#A38261',
           backgroundImage: `url("${GRID_URL}")`, 
           backgroundPosition: `${view.x}px ${view.y}px`, 
           backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px`,
           backgroundRepeat: 'repeat'
         }}
         onWheel={handleWheel} 
         onMouseDown={handleBackgroundMouseDown} 
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
         onDoubleClick={(e) => { if(e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}>
      
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 左上角 UI：工具集 + 画板列表 */}
      {!isUIHidden && (
        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10">
            <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 uppercase tracking-tighter flex items-center gap-2">
              <FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}
            </h1>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => addNote('note')} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-bold transition-colors">Add Note</button>
                <button onClick={() => addNote('photo')} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold transition-colors">Add Photo</button>
                <button onClick={() => addNote('dossier')} className="px-2 py-1 bg-orange-800 hover:bg-orange-700 rounded text-xs font-bold transition-colors">Add Dossier</button>
                <button onClick={() => addNote('scrap')} className="px-2 py-1 bg-stone-300 hover:bg-stone-200 text-stone-900 rounded text-xs font-bold transition-colors">Add Scrap</button>
                <button onClick={() => addNote('marker')} className="col-span-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold transition-colors">Add Marker</button>
            </div>
            {/* 🟢 创建图钉工具按钮 */}
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {isPinMode ? 'DONE (PLACING...)' : 'ACTIVATE PIN TOOL'}
            </button>
          </div>

          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10 flex flex-col gap-2">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-[10px] font-mono tracking-widest text-gray-400 uppercase font-bold">Archives</span>
              <button onClick={handleAddBoard} className="p-1 hover:bg-yellow-500 rounded text-yellow-500 hover:text-black transition-colors"><Plus size={14} /></button>
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
                    <button className="p-1 text-gray-600 cursor-not-allowed"><Layout size={12}/></button>
                    <button onClick={(e) => { e.stopPropagation(); setRenamingBoardId(b.id); setEditBoardName(b.name); }} className="p-1 text-blue-400 hover:bg-blue-400/20 rounded"><FileText size={12}/></button>
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
              <button onClick={toggleMusic} className="p-2 hover:bg-white/10 transition-colors">
                {isMusicPlaying ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
            </div>
            <button onClick={handleResetView} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl hover:bg-white/10 transition-colors"><LocateFixed size={20}/></button>
            <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="bg-black/80 p-2 text-white rounded-lg border border-white/10 shadow-xl hover:bg-white/10 transition-colors"><Maximize size={20}/></button>
        </div>
      )}
      
      {/* 画布渲染 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode 
              key={note.id} 
              note={note} 
              onMouseDown={handleNodeMouseDown} 
              isSelected={selectedIds.has(note.id)} 
              onDoubleClick={() => setEditingNodeId(note.id)} 
              isPinMode={isPinMode}
              isConnecting={!!connectingNodeId}
              isSelectedForConnection={connectingNodeId === note.id}
              onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: 1, resizeMode: m }); }} 
              onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
              onDelete={() => handleDeleteNote(note.id)} 
            />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} onPinMouseDown={handlePinMouseDown} onPinClick={handlePinClick} />
          
          {ghostNote && (() => {
              const t = NOTE_TYPES[ghostNote.typeIndex];
              const s: any = { note: 'border-yellow-500 bg-yellow-500/20 text-yellow-500', photo: 'border-gray-400 bg-gray-500/20 text-gray-400', dossier: 'border-orange-600 bg-orange-600/20 text-orange-600', scrap: 'border-stone-400 bg-stone-400/20 text-stone-400', marker: 'border-blue-500 bg-blue-500/20 text-blue-500' };
              return (
                <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000 }} className="pointer-events-none">
                    <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl backdrop-blur-sm animate-pulse ${s[t]}`}>
                        <span className="text-[10px] font-bold uppercase">{t}</span>
                    </div>
                </div>
              );
          })()}

          {(draggingId || resizingId || rotatingId || pinDragData) && interactionRef.current.notes.find(n => n.id === (draggingId || resizingId || rotatingId || pinDragData?.noteId)) && (() => {
            const n = interactionRef.current.notes.find(i => i.id === (draggingId || resizingId || rotatingId || pinDragData?.noteId))!;
            let text = `X:${Math.round(n.x)} Y:${Math.round(n.y)}`;
            if (rotatingId) text = `${Math.round(n.rotation)}°`;
            if (resizingId) text = `W:${Math.round(n.width || 0)} H:${Math.round(n.height || 0)}`;
            if (pinDragData) text = `Pin X:${Math.round(n.pinX || 0)} Pin Y:${Math.round(n.pinY || 0)}`;
            return <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 200 }} className="flex justify-center z-[99999]"><div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none">{text}</div></div>
          })()}
      </div>

      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>
      {editingNodeId && notes.find(n=>n.id===editingNodeId) && <EditModal note={notes.find(n=>n.id===editingNodeId)!} onSave={handleSaveNote} onClose={() => setEditingNodeId(null)} />}
      {selectionBox && <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}
    </div>
  );
};

export default App;