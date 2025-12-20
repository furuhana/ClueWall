import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Note, Connection } from '../types';
import {
  mapDbToNote,
  mapNoteToDb,
  mapDbToConnection,
  mapConnectionToDb,
  sanitizeNoteForInsert
} from '../utils';

// Added mapConnectionToDb to imports above as it was missing in snippet but likely needed or useful. 
// User snippet had manual connection payload construction, so maybe not strictly needed, but good to have context.

export const useBoardData = (
  boardId: number | undefined,
  interactionRef: React.MutableRefObject<{ draggingId: number | null; resizingId: number | null; rotatingId: number | null }>
) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [maxZIndex, setMaxZIndex] = useState(1);

  // 状态反馈：用于 UI 显示 "已保存" 或 "同步失败"
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // 1. 初始数据加载
  useEffect(() => {
    if (!boardId) return;

    const fetchBoardData = async () => {
      setIsLoading(true);
      console.log(`📥 [useBoardData] 开始加载画板 #${boardId}...`);

      try {
        // 并行加载笔记和连线
        const [notesRes, connsRes] = await Promise.all([
          supabase.from('notes').select('*').eq('board_id', boardId),
          supabase.from('connections').select('*').eq('board_id', boardId)
        ]);

        if (notesRes.error) throw notesRes.error;
        if (connsRes.error) throw connsRes.error;

        // 转换数据
        const loadedNotes = (notesRes.data || []).map(mapDbToNote);
        const loadedConns = (connsRes.data || []).map(mapDbToConnection);

        setNotes(loadedNotes);
        setConnections(loadedConns);

        // 计算最大 zIndex
        if (loadedNotes.length > 0) {
          const maxZ = Math.max(...loadedNotes.map(n => n.zIndex || 0));
          setMaxZIndex(maxZ + 1);
        }
        console.log(`✅ [useBoardData] 加载完成: ${loadedNotes.length} 笔记, ${loadedConns.length} 连线`);
      } catch (error) {
        console.error("❌ [useBoardData] 加载失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBoardData();
  }, [boardId]);

  // 2. 📡 核心：Realtime 实时订阅 (多人协作引擎)
  useEffect(() => {
    if (!boardId) return;

    console.log(`📡 [Realtime] 正在订阅画板 #${boardId} 的频道...`);

    const channel = supabase
      .channel(`board_live_${boardId}`) // 频道名称唯一
      .on(
        'postgres_changes',
        {
          event: '*', // 监听增删改
          schema: 'public',
          table: 'notes',
          filter: `board_id=eq.${boardId}`, // 只听当前画板的
        },
        (payload) => {
          console.log('🔔 [Realtime] 收到笔记更新:', payload.eventType, payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          // 忽略自己的高频更新（防止拖拽抖动）
          if (interactionRef.current?.draggingId === newRecord?.id) {
            return;
          }

          if (eventType === 'INSERT') {
            setNotes(prev => {
              if (prev.find(n => n.id === newRecord.id)) return prev;
              return [...prev, mapDbToNote(newRecord)];
            });
          } else if (eventType === 'UPDATE') {
            setNotes(prev => prev.map(n => n.id === newRecord.id ? mapDbToNote(newRecord) : n));
          } else if (eventType === 'DELETE') {
            setNotes(prev => prev.filter(n => n.id !== oldRecord.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          console.log('🕸️ [Realtime] 收到连线更新:', payload.eventType);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            setConnections(prev => {
              if (prev.find(c => c.id === newRecord.id)) return prev;
              return [...prev, mapDbToConnection(newRecord)];
            });
          } else if (eventType === 'UPDATE') {
            setConnections(prev => prev.map(c => c.id === newRecord.id ? mapDbToConnection(newRecord) : c));
          } else if (eventType === 'DELETE') {
            setConnections(prev => prev.filter(c => c.id !== oldRecord.id));
          }
        }
      )
      .subscribe((status) => {
        console.log(`📶 [Realtime] 连接状态: ${status}`);
      });

    return () => {
      console.log(`🔌 [Realtime] 断开连接`);
      supabase.removeChannel(channel);
    };
  }, [boardId]);

  // 3. 保存逻辑 (Save / Update)
  const saveToCloud = useCallback(async (notesToSave: Note[], connectionsToSave: Connection[] = []) => {
    if (!boardId) return;

    try {
      // 处理笔记更新
      if (notesToSave.length > 0) {
        const updates = notesToSave.map(note => {
          const payload = sanitizeNoteForInsert(mapNoteToDb(note));
          const cleanPayload = { ...payload };
          delete (cleanPayload as any).id; // 不允许更新主键

          return supabase.from('notes').update(cleanPayload).eq('id', note.id);
        });

        await Promise.all(updates);
      }

      // 处理连线 (使用 Upsert 解决颜色回滚和重复)
      if (connectionsToSave.length > 0) {
        const connUpdates = connectionsToSave.map(conn => {
          const payload = {
            source_id: conn.sourceId,
            target_id: conn.targetId,
            board_id: boardId,
            color: conn.color,
            // type: conn.type // Removed as Connection type might not have generic 'type' field based on standard usage usually just color. If needed, can add back.
          };
          return supabase.from('connections').upsert(payload, { onConflict: 'source_id,target_id' });
        });
        await Promise.all(connUpdates);
      }

      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      console.error("❌ 保存失败:", error);
      setSyncStatus('error');
    }
  }, [boardId]);

  // 4. 辅助函数
  const handleDeleteNote = useCallback(async (id: number) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
    await supabase.from('notes').delete().eq('id', id);
  }, []);

  const handleDeleteConnection = useCallback(async (id: number) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    await supabase.from('connections').delete().eq('id', id);
  }, []);

  const clearBoard = useCallback(async () => {
    if (!boardId) return;
    if (!window.confirm("Are you sure? This will destroy all evidence.")) return;

    setNotes([]);
    setConnections([]);
    await supabase.from('connections').delete().eq('board_id', boardId);
    await supabase.from('notes').delete().eq('board_id', boardId);
  }, [boardId]);

  const updateNote = useCallback((updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    saveToCloud([updatedNote]);
  }, [saveToCloud]);

  // Backfill missing methods expected by App.tsx (e.g. deleteFromCloud)
  // App.tsx uses: saveToCloud, deleteFromCloud, handleDeleteNote, handleDeleteConnection, clearBoard, updateNote
  // User snippet has: saveToCloud, handleDeleteNote, handleDeleteConnection, clearBoard, updateNote
  // It is missing: deleteFromCloud. 
  // I will add a simple deleteFromCloud stub or implementation to avoid App.tsx crashing if it uses it directly.
  // Actually, App.tsx (Line 216 in previous view) returns `deleteFromCloud`.
  // Wait, `handleDeleteNote` logic in User snippet calls `supabase.from...delete` directly.
  // The existing `App.tsx` might call `deleteFromCloud` externally? 
  // Let's check App.tsx usages.
  // App.tsx destructures it. If I don't return it, App.tsx might fail if it tries to use it.
  // I'll add a simple wrapper for it just in case.

  const deleteFromCloud = useCallback(async (noteId?: number, connId?: number) => {
    if (noteId) await supabase.from('notes').delete().eq('id', noteId);
    if (connId) await supabase.from('connections').delete().eq('id', connId);
  }, []);

  return {
    notes,
    setNotes,
    connections,
    setConnections,
    isLoading,
    maxZIndex,
    setMaxZIndex,
    saveToCloud,
    deleteFromCloud, // Ensure this is exported
    handleDeleteNote,
    handleDeleteConnection,
    clearBoard,
    updateNote,
    syncStatus
  };
};
