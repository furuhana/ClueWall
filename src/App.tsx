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
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isPinMode, setIsPinMode] = useState<boolean>(false);
  const [isUIHidden, setIsUIHidden] = useState<boolean>(true); 
  const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
  const [ghostNote, setGhostNote] = useState<{ x: number; y: number; typeIndex: number } | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null); 
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 引用同步
  const interactionRef = useRef({ draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden });
  useEffect(() => { 
    interactionRef.current = { draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, activeBoardId, isUIHidden]);
  
  const toWorld = useCallback((screenX: number, screenY: number) => ({ x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }), [view]);

  // --- 1. 快捷键监听 (Ctrl + U) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        const nextHiddenState = !interactionRef.current.isUIHidden;
        setIsUIHidden(nextHiddenState);
        if (nextHiddenState) setShowHiddenModeToast(true);
        return;
      }
      if (e.key === 'Escape') {
        if (interactionRef.current.isUIHidden) setIsUIHidden(false);
        else { setGhostNote(null); setConnectingNodeId(null); setIsPinMode(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- 2. 缩放控制函数 (修复 handleZoomIn is not defined) ---
  const handleZoomIn = () => setView(v => ({ ...v, zoom: Math.min(v.zoom + 0.1, 3.0) }));
  const handleZoomOut = () => setView(v => ({ ...v, zoom: Math.max(v.zoom - 0.1, 0.1) }));
  const handleResetView = () => setView({ x: 0, y: 0, zoom: 1 });

  // --- 3. 数据隔离与加载 ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      const { data: bData } = await supabase.from('boards').select('*').order('updated_at', { ascending: true });
      if (bData && bData.length > 0) setBoards(bData);
      else {
        const def = { id: 'main-case', name: 'Main Case' };
        await supabase.from('boards').insert([def]);
        setBoards([def]);
      }
      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);
      setNotes(nData ? (nData as any) : []);
      setConnections(cData ? (cData as any) : []);
      setIsLoading(false);
    };
    fetchInitialData();
  }, [activeBoardId]);

  // --- 4. 核心保存与删除逻辑 ---
  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
      if (changedNotes.length > 0) await supabase.from('notes').upsert(changedNotes.map(n => ({ ...n, board_id: activeBoardId })));
      if (changedConns.length > 0) await supabase.from('connections').upsert(changedConns.map(c => ({ ...c, board_id: activeBoardId })));
  };

  const deleteFromCloud = async (noteId?: string, connId?: string) => {
      if (noteId) await supabase.from('notes').delete().eq('id', noteId);
      if (connId) await supabase.from('connections').delete().eq('id', connId);
  };

  const handleDeleteNote = (id: string) => {
    const target = notes.find(n => n.id === id);
    if (target?.fileId) deleteImageFromDrive(target.fileId);
    setNotes(notes.filter(n => n.id !== id));
    setConnections(connections.filter(c => c.sourceId !== id && c.targetId !== id));
    deleteFromCloud(id);
  };

  const handleSaveNote = (updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    setEditingNodeId(null);
    saveToCloud([updatedNote], []);
  };

  // --- 5. 交互函数 ---
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

    if (resizingId && transformStart) {
        const note = notes.find(n => n.id === resizingId); if(!note) return;
        const dx = (e.clientX - transformStart.mouseX) / view.zoom;
        const dy = (e.clientY - transformStart.mouseY) / view.zoom;
        const rad = -(transformStart.initialRotation * Math.PI) / 180;
        const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

        const LIMITS: any = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 182 }, marker: { w: 30, h: 30 } };
        const min = LIMITS[note.type] || { w: 30, h: 30 };
        let newW = transformStart.initialWidth; let newH = transformStart.initialHeight;
        let newX = transformStart.initialX; let newY = transformStart.initialY;

        if (transformStart.resizeMode === 'RIGHT') newW = Math.max(min.w, transformStart.initialWidth + localDx);
        if (transformStart.resizeMode === 'BOTTOM') newH = Math.max(min.h, transformStart.initialHeight + localDy);
        if (transformStart.resizeMode === 'LEFT') { newW = Math.max(min.w, transformStart.initialWidth - localDx); newX = transformStart.initialX + (transformStart.initialWidth - newW); }
        if (transformStart.resizeMode === 'TOP') { newH = Math.max(min.h, transformStart.initialHeight - localDy); newY = transformStart.initialY + (transformStart.initialHeight - newH); }
        setNotes(prev => prev.map(n => n.id === resizingId ? { ...n, width: newW, height: newH, x: newX, y: newY } : n));
        return;
    }

    if (rotatingId && transformStart) {
        const deltaX = e.clientX - transformStart.mouseX;
        setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - (deltaX * 0.5) } : n));
    }
    
    if (connectingNodeId) setMousePos(toWorld(e.clientX, e.clientY));
  }, [draggingId, resizingId, rotatingId, selectionBox, view, notes, selectedIds, transformStart, connectingNodeId, toWorld]);

  const handleMouseUp = () => {
    if (draggingId || resizingId || rotatingId) {
      const changed = notes.filter(n => n.id === (draggingId || resizingId || rotatingId) || selectedIds.has(n.id));
      saveToCloud(changed, []);
    }
    setDraggingId(null); setResizingId(null); setRotatingId(null); setSelectionBox(null); setIsPanning(false);
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

  // --- 6. 音频逻辑 (修复 Sources 报错) ---
  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current && !isMusicPlaying) {
        audioRef.current.volume = 0.5;
        audioRef.current.play()
          .then(() => setIsMusicPlaying(true))
          .catch(err => console.warn("音频加载受限:", err));
        window.removeEventListener('click', playBgm);
      }
    };
    window.addEventListener('click', playBgm);
    return () => window.removeEventListener('click', playBgm);
  }, [isMusicPlaying]);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isMusicPlaying) { audioRef.current.pause(); setIsMusicPlaying(false); }
    else { audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => {}); }
  };

  // --- 7. 画板管理 ---
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

  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    const LIMITS: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] };
    const dims = LIMITS[type] || [200, 200];
    const newNote: Note = { id: `n-${Date.now()}`, type, content: 'New Clue', x: ghostNote.x - dims[0]/2, y: ghostNote.y - dims[1]/2, zIndex: maxZIndex + 1, rotation: 0, hasPin: false, width: dims[0], height: dims[1], scale: 1 };
    setNotes([...notes, newNote]);
    saveToCloud([newNote], []);
    setGhostNote(null);
  };

  return (
    <div ref={boardRef} className="w-screen h-screen relative overflow-hidden bg-[#A38261] select-none" 
         style={{ backgroundImage: `url("${GRID_URL}")`, backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px` }}
         onWheel={handleWheel} 
         onMouseDown={(e) => {
           if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
           if (e.button === 1 || isSpacePressed) { setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
           else if (e.button === 0) { setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY }); setSelectedIds(new Set()); }
         }} 
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
         onDoubleClick={(e) => { if(e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}>
      
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* 左上角：工具集 + 画板列表 */}
      {!isUIHidden && (
        <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
          <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10">
            <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 flex items-center gap-2 uppercase">
              <FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}
            </h1>
            <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700'}`}>
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
              <button onClick={toggleMusic} className="p-2 hover:bg-white/10 transition-colors">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={handleResetView} className="p-2 border-b border-white/10 hover:bg-white/10 transition-colors" title="Reset View"><LocateFixed size={20}/></button>
              <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="p-2 hover:bg-white/10 transition-colors" title="Hide UI (Ctrl+U)"><Maximize size={20}/></button>
            </div>
        </div>
      )}

      {/* 画布核心 */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {notes.map((note) => (
            <DetectiveNode key={note.id} note={note} onMouseDown={handleNodeMouseDown} isSelected={selectedIds.has(note.id)} 
                           onDoubleClick={() => setEditingNodeId(note.id)} onResizeStart={(e, m) => { e.stopPropagation(); setResizingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: note.width || 200, initialHeight: note.height || 200, initialX: note.x, initialY: note.y, initialScale: 1, resizeMode: m }); }} 
                           onRotateStart={(e) => { e.stopPropagation(); setRotatingId(note.id); setTransformStart({ mouseX: e.clientX, mouseY: e.clientY, initialRotation: note.rotation, initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1 }); }} 
                           onDelete={() => handleDeleteNote(note.id)} />
          ))}
          <ConnectionLayer connections={connections} notes={notes} connectingNodeId={connectingNodeId} mousePos={mousePos} />
          
          {/* Ghost 预览 */}
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