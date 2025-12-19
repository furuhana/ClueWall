import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Note, Connection, DragOffset } from './types';
import { getNoteDimensions } from './utils';
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
import EditModal from './components/EditModal';
import { 
  Trash2, MapPin, UploadCloud, Plus, Minus, Volume2, VolumeX, LocateFixed, Maximize, Loader2, MousePointer2,
  StickyNote, Image as ImageIcon, Folder, FileText, Crosshair, FolderKanban, FileText as FileIcon, Layout
} from 'lucide-react';
import { supabase } from './supabaseClient';
// 确保 api.ts 中导出了这两个函数
import { uploadImage, deleteImageFromDrive } from './api'; 

const GRID_URL = "data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='30' height='30' fill='none' stroke='%23CAB9A1' stroke-width='0.7' opacity='0.3'/%3E%3C/svg%3E";
type ResizeMode = 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';

// --- 类型定义 ---
interface TransformStartData { mouseX: number; mouseY: number; initialRotation: number; initialWidth: number; initialHeight: number; initialX: number; initialY: number; initialScale: number; resizeMode?: ResizeMode; }
interface PinDragData { noteId: string; startX: number; startY: number; initialPinX: number; initialPinY: number; rotation: number; width: number; height: number; }
interface SelectionBox { startX: number; startY: number; currentX: number; currentY: number; }
interface Board { id: string; name: string; }

const NOTE_TYPES: Note['type'][] = ['note', 'photo', 'dossier', 'scrap', 'marker'];

const App: React.FC = () => {
  // =========================================
  // 1. 状态定义 (合并了新旧所有状态)
  // =========================================
  
  // 画板数据
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState("");

  // 核心数据
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(true);

  // 视图与交互
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isUIHidden, setIsUIHidden] = useState<boolean>(true); // 默认隐藏
  const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  // 操作状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [transformStart, setTransformStart] = useState<TransformStartData | null>(null);
  
  // 连线与图钉
  const [pinDragData, setPinDragData] = useState<PinDragData | null>(null);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [isPinMode, setIsPinMode] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // 连线时的鼠标位置

  // 特殊模式
  const [ghostNote, setGhostNote] = useState<{ x: number; y: number; typeIndex: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Refs
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragCounter = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const isPinDragRef = useRef(false);

  // 关键：Interaction Ref 必须包含 activeBoardId，防止闭包导致保存到错误的画板
  const interactionRef = useRef({ 
    draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, 
    notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId 
  });
  
  useEffect(() => { 
    interactionRef.current = { 
      draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, 
      notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId 
    }; 
  }, [draggingId, resizingId, rotatingId, pinDragData, selectionBox, selectedIds, notes, connections, connectingNodeId, ghostNote, isUIHidden, activeBoardId]);

  const toWorld = useCallback((screenX: number, screenY: number) => { 
    return { x: (screenX - view.x) / view.zoom, y: (screenY - view.y) / view.zoom }; 
  }, [view]);

  // =========================================
  // 2. 数据层逻辑 (初始化与同步)
  // =========================================

  // 初始化画板
  useEffect(() => {
    const initBoards = async () => {
      setIsLoading(true);
      const { data } = await supabase.from('boards').select('*').order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setBoards(data);
        setActiveBoardId(data[0].id);
      } else {
        // 如果没有画板，创建一个默认的
        const newBoard = { id: `case-${Date.now()}`, name: 'Main Case' };
        await supabase.from('boards').insert([newBoard]);
        setBoards([newBoard]);
        setActiveBoardId(newBoard.id);
      }
    };
    initBoards();
  }, []);

  // 切换画板时加载数据
  useEffect(() => {
    if (!activeBoardId) return;
    
    const loadBoardData = async () => {
      setIsLoading(true);
      // 清空当前视图，防止闪烁
      setNotes([]);
      setConnections([]);

      const { data: nData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: cData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);

      if (nData) {
        setNotes(nData as any);
        // 恢复 MaxZIndex，防止层级错乱
        const maxZ = nData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
        setMaxZIndex(maxZ);
      }
      if (cData) {
        setConnections(cData as any);
      }
      setIsLoading(false);
    };
    loadBoardData();
  }, [activeBoardId]);

  // 保存数据 (核心：必须带上 board_id)
  const saveToCloud = async (changedNotes: Note[], changedConns: Connection[]) => {
    const currentBoardId = interactionRef.current.activeBoardId;
    if (!currentBoardId) return;

    if (changedNotes.length > 0) {
      const payload = changedNotes.map(n => ({ ...n, board_id: currentBoardId }));
      await supabase.from('notes').upsert(payload);
    }
    if (changedConns.length > 0) {
      const payload = changedConns.map(c => ({ ...c, board_id: currentBoardId }));
      await supabase.from('connections').upsert(payload);
    }
  };

  const deleteFromCloud = async (noteId?: string, connId?: string) => {
    if (noteId) await supabase.from('notes').delete().eq('id', noteId);
    if (connId) await supabase.from('connections').delete().eq('id', connId);
  };

  // 单个删除逻辑 (保留旧版的 Drive 删除)
  const handleDeleteNote = (id: string) => {
    const noteToDelete = notes.find(n => n.id === id);
    if (noteToDelete?.fileId) {
      deleteImageFromDrive(noteToDelete.fileId); // 🟢 触发 Drive 删除
    }

    const nextNotes = notes.filter(n => n.id !== id);
    const nextConns = connections.filter(c => c.sourceId !== id && c.targetId !== id);
    
    setNotes(nextNotes);
    setConnections(nextConns);
    
    // 即使在 UI 上移除了，也要通知云端
    deleteFromCloud(id);
    const relatedConns = connections.filter(c => c.sourceId === id || c.targetId === id);
    relatedConns.forEach(c => deleteFromCloud(undefined, c.id));
    
    if (connectingNodeId === id) setConnectingNodeId(null);
  };

  // =========================================
  // 3. 全局事件监听 (键盘)
  // =========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 🟢 1. Ctrl + U (UI 切换 - 新版功能)
      if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        const nextState = !interactionRef.current.isUIHidden;
        setIsUIHidden(nextState);
        if (nextState) setShowHiddenModeToast(true);
        return;
      }

      // 🟢 2. 幽灵模式控制 (旧版功能 - 恢复方向键)
      if (interactionRef.current.ghostNote) {
        if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
          setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + 1) % NOTE_TYPES.length } : null);
          return;
        }
        if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
          setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex - 1 + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
          return;
        }
        if (e.key === 'Enter') {
          confirmGhostCreation();
          return;
        }
      }

      // 🟢 3. 删除键 (合并批量删除与 Drive 清理)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingNodeId) return; // 编辑文字时不删除

        const { connectingNodeId: activeConnId, selectedIds: currentSelected, notes: currentNotes, connections: currentConns } = interactionRef.current;

        // 情况 A: 正在连线模式下删除图钉
        if (activeConnId) {
          const nextNotes = currentNotes.map(n => n.id === activeConnId ? { ...n, hasPin: false } : n);
          const nextConns = currentConns.filter(c => c.sourceId !== activeConnId && c.targetId !== activeConnId);
          setNotes(nextNotes);
          setConnections(nextConns);
          setConnectingNodeId(null);
          saveToCloud([nextNotes.find(n => n.id === activeConnId)!], []); // 更新 pin 状态
          // 删除相关连线
          currentConns.filter(c => c.sourceId === activeConnId || c.targetId === activeConnId).forEach(c => deleteFromCloud(undefined, c.id));
          return;
        }

        // 情况 B: 批量删除选中的便签
        if (currentSelected.size > 0) {
          const idsArray = Array.from(currentSelected);
          
          // 遍历删除 Drive 文件
          idsArray.forEach(id => {
            const n = currentNotes.find(note => note.id === id);
            if (n?.fileId) deleteImageFromDrive(n.fileId);
            deleteFromCloud(id);
          });

          const nextNotes = currentNotes.filter(n => !currentSelected.has(n.id));
          const nextConns = currentConns.filter(c => !currentSelected.has(c.sourceId) && !currentSelected.has(c.targetId));
          
          setNotes(nextNotes);
          setConnections(nextConns);
          
          // 删除相关连线
          const deletedConns = currentConns.filter(c => currentSelected.has(c.sourceId) || currentSelected.has(c.targetId));
          deletedConns.forEach(c => deleteFromCloud(undefined, c.id));
          
          setSelectedIds(new Set());
        }
      }

      // 🟢 4. 其它控制
      if (e.key === 'Escape') {
        if (interactionRef.current.ghostNote) {
          setGhostNote(null);
        } else if (interactionRef.current.isUIHidden) {
          setIsUIHidden(false);
        } else {
          setConnectingNodeId(null);
          setIsPinMode(false);
          setSelectedIds(new Set());
          setSelectionBox(null);
          setDraggingId(null);
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
  }, [editingNodeId]); // 依赖极简，主要靠 ref


  // =========================================
  // 4. 鼠标交互 (核心逻辑)
  // =========================================

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1 || isSpacePressed) return; // 空格平移优先
    e.stopPropagation();
    if (ghostNote) { setGhostNote(null); return; }

    const targetNote = notes.find(n => n.id === id);
    if (!targetNote) return;

    // A. 连线/图钉模式
    if (isPinMode || connectingNodeId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // 逆旋转计算
      const rad = -(targetNote.rotation * Math.PI) / 180;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const localDx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / view.zoom;
      const localDy = (dx * Math.sin(rad) + dy * Math.cos(rad)) / view.zoom;
      const { width, height } = getNoteDimensions(targetNote);
      
      const pinX = (width / 2) + localDx;
      const pinY = (height / 2) + localDy;

      if (isPinMode) {
        // 打钉子
        const updated = { ...targetNote, hasPin: true, pinX, pinY };
        setNotes(prev => prev.map(n => n.id === id ? updated : n));
        saveToCloud([updated], []);
      } else if (connectingNodeId && connectingNodeId !== id) {
        // 连线
        const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939', board_id: activeBoardId };
        setConnections(prev => [...prev, newConn]);
        saveToCloud([], [newConn]);
        setConnectingNodeId(null);
      }
      return;
    }

    // B. 选择逻辑
    const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
    if (isMulti) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
    }

    // C. 置顶与准备
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    
    // 🟢 恢复 Alt 键复制功能
    if (e.altKey) {
      const newId = `dup-${Date.now()}`;
      const dupNote: Note = { 
        ...targetNote, 
        id: newId, 
        x: targetNote.x + 20, 
        y: targetNote.y + 20, 
        zIndex: newZ, 
        hasPin: false,
        board_id: activeBoardId // 确保属于当前画板
      };
      setNotes(prev => [...prev, dupNote]);
      setDraggingId(newId);
      setSelectedIds(new Set([newId]));
      lastDragPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 普通拖拽
    setNotes(prev => prev.map(n => selectedIds.has(n.id) || n.id === id ? { ...n, zIndex: newZ } : n));
    setDraggingId(id);
    lastDragPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (ghostNote) return;

    // 1. 框选
    if (selectionBox) {
      const currentX = e.clientX;
      const currentY = e.clientY;
      setSelectionBox(prev => prev ? ({ ...prev, currentX, currentY }) : null);

      // 计算框选区域的世界坐标
      const left = Math.min(selectionBox.startX, currentX);
      const right = Math.max(selectionBox.startX, currentX);
      const top = Math.min(selectionBox.startY, currentY);
      const bottom = Math.max(selectionBox.startY, currentY);

      const wLeft = (left - view.x) / view.zoom;
      const wRight = (right - view.x) / view.zoom;
      const wTop = (top - view.y) / view.zoom;
      const wBottom = (bottom - view.y) / view.zoom;

      const nextSelected = new Set<string>();
      notes.forEach(n => {
        const d = getNoteDimensions(n);
        // 简单的 AABB 碰撞检测
        const nRight = n.x + d.width;
        const nBottom = n.y + d.height;
        if (n.x < wRight && nRight > wLeft && n.y < wBottom && nBottom > wTop) {
          nextSelected.add(n.id);
        }
      });
      setSelectedIds(nextSelected);
      return;
    }

    // 2. 拖拽节点
    if (draggingId && lastDragPosRef.current) {
      const dx = (e.clientX - lastDragPosRef.current.x) / view.zoom;
      const dy = (e.clientY - lastDragPosRef.current.y) / view.zoom;
      
      setNotes(prev => prev.map(n => {
        if (n.id === draggingId || selectedIds.has(n.id)) {
          return { ...n, x: n.x + dx, y: n.y + dy };
        }
        return n;
      }));
      lastDragPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 3. 拉伸 (包含最小限制)
    if (resizingId && transformStart) {
      const note = notes.find(n => n.id === resizingId);
      if (!note) return;
      
      const worldDx = (e.clientX - transformStart.mouseX) / view.zoom;
      const worldDy = (e.clientY - transformStart.mouseY) / view.zoom;
      const rad = -(transformStart.initialRotation * Math.PI) / 180;
      
      // 投影到局部坐标系
      const localDx = worldDx * Math.cos(rad) - worldDy * Math.sin(rad);
      const localDy = worldDx * Math.sin(rad) + worldDy * Math.cos(rad);

      // 最小尺寸定义
      const MIN_DIMS: any = { note: { w: 106, h: 160 }, photo: { w: 124, h: 140 }, scrap: { w: 146, h: 50 }, dossier: { w: 256, h: 224 }, marker: { w: 30, h: 30 } };
      const limits = MIN_DIMS[note.type] || { w: 50, h: 50 };

      let { initialX, initialY, initialWidth, initialHeight } = transformStart;
      let newW = initialWidth, newH = initialHeight, newX = initialX, newY = initialY;

      if (transformStart.resizeMode === 'CORNER') {
        // 等比缩放
        const ratio = initialWidth / initialHeight;
        newW = Math.max(limits.w, initialWidth + ((-localDx + localDy * ratio) / 2)); // 简化计算
        newH = newW / ratio;
        if (newH < limits.h) { newH = limits.h; newW = newH * ratio; }
        
        const wChange = newW - initialWidth;
        const hChange = newH - initialHeight;
        newX = initialX - wChange / 2;
        newY = initialY - hChange / 2;

      } else {
        // 边拉伸
        if (transformStart.resizeMode === 'RIGHT') newW = Math.max(limits.w, initialWidth + localDx);
        if (transformStart.resizeMode === 'BOTTOM') newH = Math.max(limits.h, initialHeight + localDy);
        if (transformStart.resizeMode === 'LEFT') {
          newW = Math.max(limits.w, initialWidth - localDx);
          newX = initialX + (initialWidth - newW);
        }
        if (transformStart.resizeMode === 'TOP') {
          newH = Math.max(limits.h, initialHeight - localDy);
          newY = initialY + (initialHeight - newH);
        }
      }

      setNotes(prev => prev.map(n => n.id === resizingId ? { 
        ...n, width: newW, height: newH, x: newX, y: newY,
        // 如果是文本类，更新 scale
        scale: ['note', 'dossier', 'scrap'].includes(n.type) ? (newW / (initialWidth / transformStart.initialScale)) : n.scale 
      } : n));
      return;
    }

    // 4. 旋转
    if (rotatingId && transformStart) {
      const dx = e.clientX - transformStart.mouseX;
      setNotes(prev => prev.map(n => n.id === rotatingId ? { ...n, rotation: transformStart.initialRotation - (dx * 0.5) } : n));
      return;
    }

    // 5. 平移画布
    if (isPanning && lastMousePosRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 6. 连线时的红线跟随
    if (connectingNodeId) {
      const wm = toWorld(e.clientX, e.clientY);
      setMousePos({ x: wm.x, y: wm.y });
    }

  }, [ghostNote, selectionBox, draggingId, resizingId, rotatingId, isPanning, connectingNodeId, transformStart, view, notes, selectedIds]);

  const handleMouseUp = () => {
    // 触发保存
    if (draggingId || resizingId || rotatingId) {
      const activeIds = new Set([draggingId, resizingId, rotatingId].filter(Boolean) as string[]);
      selectedIds.forEach(id => activeIds.add(id));
      
      const changedNotes = notes.filter(n => activeIds.has(n.id));
      saveToCloud(changedNotes, []);
    }

    setDraggingId(null);
    setResizingId(null);
    setRotatingId(null);
    setSelectionBox(null);
    setIsPanning(false);
    setTransformStart(null);
    lastMousePosRef.current = null;
    lastDragPosRef.current = null;
  };

  // =========================================
  // 5. 文件拖拽上传 (恢复旧版完整功能)
  // =========================================
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let currentZ = maxZIndex;
    const worldPos = toWorld(e.clientX, e.clientY);
    const dropX = worldPos.x;
    const dropY = worldPos.y;

    const promises = imageFiles.map(async (file, index) => {
      // 🟢 1. 上传到 Drive
      const driveFileId = await uploadImage(file);
      if (!driveFileId) return null;

      // 🟢 2. 加载图片获取尺寸
      return new Promise<Note>((resolve) => {
        const img = new Image();
        img.src = driveFileId; // 这里假设 uploadImage 返回的是可访问的 URL
        img.onload = () => {
          const MAX_WIDTH = 300;
          let finalWidth = img.width;
          let finalHeight = img.height;
          if (finalWidth > MAX_WIDTH) {
            const ratio = MAX_WIDTH / finalWidth;
            finalWidth = MAX_WIDTH;
            finalHeight = finalHeight * ratio;
          }
          currentZ++;
          
          resolve({
            id: `ev-${Date.now()}-${index}`,
            type: 'photo',
            content: file.name,
            fileId: driveFileId,
            x: dropX - (finalWidth / 2) + (index * 20),
            y: dropY - (finalHeight / 2) + (index * 20),
            zIndex: currentZ,
            rotation: (Math.random() * 10) - 5,
            hasPin: false,
            width: finalWidth,
            height: finalHeight,
            scale: 1,
            board_id: activeBoardId // 确保关联画板
          });
        };
      });
    });

    const loadedNotes = (await Promise.all(promises)).filter(n => n !== null) as Note[];
    if (loadedNotes.length > 0) {
      setMaxZIndex(currentZ);
      setNotes(prev => [...prev, ...loadedNotes]);
      saveToCloud(loadedNotes, []);
    }
  }, [maxZIndex, toWorld, activeBoardId]);

  // =========================================
  // 6. 辅助功能 (Ghost, Audio, Board Ops)
  // =========================================

  const confirmGhostCreation = () => {
    if (!ghostNote) return;
    const type = NOTE_TYPES[ghostNote.typeIndex];
    // 默认尺寸
    const DIMS: any = { note: [256, 160], photo: [256, 280], dossier: [256, 224], scrap: [257, 50], marker: [30, 30] };
    const [w, h] = DIMS[type] || [200, 200];
    
    const newNote: Note = {
      id: `new-${Date.now()}`,
      type,
      content: 'New Clue',
      x: ghostNote.x - w/2,
      y: ghostNote.y - h/2,
      zIndex: maxZIndex + 1,
      rotation: (Math.random() * 6) - 3,
      hasPin: false,
      width: w,
      height: h,
      scale: 1,
      board_id: activeBoardId,
      fileId: type === 'photo' ? '/photo_1.png' : undefined // 默认占位图
    };
    
    setNotes(prev => [...prev, newNote]);
    setMaxZIndex(prev => prev + 1);
    saveToCloud([newNote], []);
    setGhostNote(null);
  };

  // 画板操作
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
    if (boards.length <= 1) return; // 至少保留一个
    if (!window.confirm("Archiving this case will erase all linked clues. Confirm?")) return;
    
    await supabase.from('boards').delete().eq('id', id);
    // 级联删除通常由数据库处理，或者后端处理
    
    const remaining = boards.filter(b => b.id !== id);
    setBoards(remaining);
    if (activeBoardId === id) setActiveBoardId(remaining[0].id);
  };

  // 音频修复
  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current && !isMusicPlaying) {
        audioRef.current.volume = 0.3;
        audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(e => console.log("Autoplay prevented"));
        window.removeEventListener('click', playBgm);
      }
    };
    window.addEventListener('click', playBgm);
    return () => window.removeEventListener('click', playBgm);
  }, [isMusicPlaying]);

  // =========================================
  // 7. 渲染层
  // =========================================
  return (
    <div 
      ref={boardRef}
      className={`w-screen h-screen relative overflow-hidden bg-[#A38261] select-none ${isSpacePressed ? 'cursor-grab' : ''}`}
      style={{ 
        backgroundImage: `url("${GRID_URL}"), linear-gradient(180deg, #A38261 22.65%, #977049 100%)`, 
        backgroundPosition: `${view.x}px ${view.y}px, 0 0`, 
        backgroundSize: `${30 * view.zoom}px ${30 * view.zoom}px, 100% 100%`,
        backgroundRepeat: 'repeat, no-repeat'
      }}
      onWheel={(e) => {
        if (ghostNote) {
          const dir = e.deltaY > 0 ? 1 : -1;
          setGhostNote(prev => prev ? { ...prev, typeIndex: (prev.typeIndex + dir + NOTE_TYPES.length) % NOTE_TYPES.length } : null);
        } else if (!editingNodeId) {
          const delta = -e.deltaY * 0.001;
          const newZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0);
          const m = toWorld(e.clientX, e.clientY);
          setView({ x: e.clientX - m.x * newZoom, y: e.clientY - m.y * newZoom, zoom: newZoom });
        }
      }}
      onMouseDown={(e) => {
        if (ghostNote && e.button === 0) { confirmGhostCreation(); return; }
        if (e.button === 1 || isSpacePressed) { setIsPanning(true); lastMousePosRef.current = { x: e.clientX, y: e.clientY }; }
        else if (e.button === 0 && e.target === boardRef.current) {
          setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
          setSelectedIds(new Set());
          setConnectingNodeId(null);
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => { if (e.target === boardRef.current) setGhostNote({ ...toWorld(e.clientX, e.clientY), typeIndex: 0 }); }}
      onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDraggingFile(true); }}
      onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDraggingFile(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 🟢 样式补丁：确保连线虚线正常显示 */}
      <style>{`.animate-dash { stroke-dasharray: 8 4 !important; }`}</style>
      <audio ref={audioRef} src="/home_bgm.mp3" loop />

      {/* Loading */}
      {isLoading && <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[10001]"><Loader2 className="animate-spin text-yellow-400" size={48}/></div>}
      
      {/* 拖拽上传覆盖层 */}
      {isDraggingFile && <div className="absolute inset-0 bg-black/60 z-[10000] flex items-center justify-center border-8 border-dashed border-gray-400 m-4 rounded-xl pointer-events-none"><div className="bg-gray-800 text-white px-8 py-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-bounce"><UploadCloud size={64} className="text-blue-400"/><h2 className="text-2xl font-bold uppercase tracking-widest">Drop Evidence File</h2></div></div>}
      
      {/* Toast 提示 */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/10 transition-opacity z-[13000] pointer-events-none ${showHiddenModeToast ? 'opacity-100' : 'opacity-0'}`}>PRESS CTRL+U TO SHOW UI</div>

      {/* ================= UI 区域 ================= */}
      {!isUIHidden && (
        <>
          {/* 左侧：画板管理 (新版功能) */}
          <div className="absolute top-4 left-4 z-[9999] flex flex-col gap-3 w-64" onMouseDown={e => e.stopPropagation()}>
            <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-white/10">
              <h1 className="text-xl font-bold font-handwriting mb-3 text-red-500 flex items-center gap-2 uppercase truncate">
                <FolderKanban size={20}/> {boards.find(b => b.id === activeBoardId)?.name || 'CASE FILE'}
              </h1>
              <button onClick={() => setIsPinMode(!isPinMode)} className={`w-full py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 ${isPinMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}>
                <MapPin size={14}/> {isPinMode ? 'FINISH PINNING' : 'ACTIVATE PIN TOOL'}
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

          {/* 右侧：视图控制 (合并功能) */}
          <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={() => setView(v => ({...v, zoom: Math.min(v.zoom+0.1, 3)}))} className="p-2 border-b border-white/10 hover:bg-white/10"><Plus size={20}/></button>
              <div className="text-[10px] font-mono py-1 w-10 text-center">{Math.round(view.zoom * 100)}%</div>
              <button onClick={() => setView(v => ({...v, zoom: Math.max(v.zoom-0.1, 0.1)}))} className="p-2 border-b border-white/10 hover:bg-white/10"><Minus size={20}/></button>
              <button onClick={() => { if(audioRef.current) isMusicPlaying ? audioRef.current.pause() : audioRef.current.play(); setIsMusicPlaying(!isMusicPlaying); }} className="p-2 hover:bg-white/10 transition-colors">{isMusicPlaying ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
            </div>
            <div className="bg-black/80 backdrop-blur text-white rounded-lg border border-white/10 flex flex-col items-center shadow-xl">
              <button onClick={() => setView({ x: 0, y: 0, zoom: 1 })} className="p-2 border-b border-white/10 hover:bg-white/10" title="Reset View"><LocateFixed size={20}/></button>
              <button onClick={() => { setIsUIHidden(true); setShowHiddenModeToast(true); }} className="p-2 hover:bg-white/10 transition-colors" title="Hide UI (Ctrl+U)"><Maximize size={20}/></button>
            </div>
          </div>
        </>
      )}

      {/* ================= 画布内容区域 ================= */}
      <div className="absolute top-0 left-0 w-0 h-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
        
        {/* 节点层 */}
        {notes.map((note) => (
          <DetectiveNode 
            key={note.id} 
            note={note} 
            onMouseDown={handleNodeMouseDown} 
            isSelected={selectedIds.has(note.id)} 
            onDoubleClick={() => setEditingNodeId(note.id)}
            // 传递拉伸/旋转回调
            onResizeStart={(e, mode) => { 
              e.stopPropagation(); e.preventDefault();
              setResizingId(note.id);
              setTransformStart({ 
                mouseX: e.clientX, mouseY: e.clientY, 
                initialRotation: note.rotation, 
                initialWidth: note.width || 200, 
                initialHeight: note.height || 200, 
                initialX: note.x, initialY: note.y, 
                initialScale: note.scale || 1, 
                resizeMode: mode 
              }); 
            }}
            onRotateStart={(e) => {
              e.stopPropagation(); e.preventDefault();
              setRotatingId(note.id);
              setTransformStart({
                mouseX: e.clientX, mouseY: e.clientY,
                initialRotation: note.rotation,
                initialWidth: 0, initialHeight: 0, initialX: 0, initialY: 0, initialScale: 1
              });
            }}
            onDelete={() => handleDeleteNote(note.id)}
            // 如果旧版 DetectiveNode 还需要其他参数，这里补充 (如 onStartPin)
            onStartPin={() => setIsPinMode(true)}
          />
        ))}
        
        {/* 连线层 */}
        <ConnectionLayer 
            connections={connections} 
            notes={notes} 
            connectingNodeId={connectingNodeId} 
            mousePos={mousePos}
            // 传递连线层需要的点击事件
            onPinClick={(e, id) => { 
                e.stopPropagation(); 
                if(connectingNodeId === null) setConnectingNodeId(id); 
                else if(connectingNodeId !== id) {
                    const newConn = { id: `c-${Date.now()}`, sourceId: connectingNodeId, targetId: id, color: '#D43939', board_id: activeBoardId };
                    setConnections(prev => [...prev, newConn]);
                    saveToCloud([], [newConn]);
                    setConnectingNodeId(null);
                }
            }}
            onDeleteConnection={(id) => {
                setConnections(prev => prev.filter(c => c.id !== id));
                deleteFromCloud(undefined, id);
            }}
            onConnectionColorChange={(id, color) => {
                const updated = connections.map(c => c.id === id ? { ...c, color } : c);
                setConnections(updated);
                saveToCloud([], updated.filter(c => c.id === id));
            }}
            // 补充漏掉的属性
            isPinMode={isPinMode}
            onPinMouseDown={() => {}} // 简化处理
        />

        {/* Ghost 预览 (旧版视觉) */}
        {ghostNote && (() => {
          const type = NOTE_TYPES[ghostNote.typeIndex];
          const styles: any = { 
            note: 'border-yellow-500 bg-yellow-500/20 text-yellow-500', 
            photo: 'border-gray-400 bg-gray-500/20 text-gray-400', 
            dossier: 'border-orange-600 bg-orange-600/20 text-orange-600', 
            scrap: 'border-stone-400 bg-stone-400/20 text-stone-400', 
            marker: 'border-blue-500 bg-blue-500/20 text-blue-500' 
          };
          const icons: any = { note: StickyNote, photo: ImageIcon, dossier: Folder, scrap: FileText, marker: MapPin };
          const Icon = icons[type];
          
          return (
            <div style={{ position: 'absolute', left: ghostNote.x, top: ghostNote.y, transform: 'translate(-50%, -50%)', zIndex: 20000 }} className="pointer-events-none">
              <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center shadow-2xl backdrop-blur-sm animate-pulse ${styles[type]}`}>
                <Icon size={40}/>
                <span className="text-[10px] font-bold mt-1 uppercase">{type}</span>
              </div>
            </div>
          );
        })()}

        {/* 实时数值显示 (操作反馈) */}
        {(draggingId || resizingId || rotatingId) && (() => {
          const n = notes.find(i => i.id === (draggingId || resizingId || rotatingId));
          if (!n) return null;
          let text = '';
          if (rotatingId) text = `${Math.round(n.rotation)}°`;
          else if (resizingId) text = `W:${Math.round(n.width || 0)} H:${Math.round(n.height || 0)}`;
          else text = `X:${Math.round(n.x)} Y:${Math.round(n.y)}`;
          
          return (
            <div style={{ position: 'absolute', left: n.x, top: n.y - 35, width: n.width || 200 }} className="flex justify-center z-[99999]">
              <div className="bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg backdrop-blur pointer-events-none whitespace-nowrap">
                {text}
              </div>
            </div>
          );
        })()}

      </div>

      {/* 框选层 */}
      {selectionBox && (
        <div 
          className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-[9999]" 
          style={{ 
            left: Math.min(selectionBox.startX, selectionBox.currentX), 
            top: Math.min(selectionBox.startY, selectionBox.currentY), 
            width: Math.abs(selectionBox.currentX - selectionBox.startX), 
            height: Math.abs(selectionBox.currentY - selectionBox.startY) 
          }} 
        />
      )}

      {/* 编辑模态框 */}
      {editingNodeId && notes.find(n => n.id === editingNodeId) && (
        <EditModal 
          note={notes.find(n => n.id === editingNodeId)!} 
          onSave={(updated) => {
            setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
            setEditingNodeId(null);
            saveToCloud([updated], []);
          }} 
          onClose={() => setEditingNodeId(null)} 
        />
      )}

    </div>
  );
};

export default App;