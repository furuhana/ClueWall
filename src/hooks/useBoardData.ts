import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Note, Connection } from '../types';
import { deleteImageFromDrive } from '../api';
import { mapDbToNote, mapNoteToDb, mapDbToConnection, mapConnectionToDb, sanitizeNoteForInsert, sanitizeConnectionForInsert } from '../utils';

export const useBoardData = (
  activeBoardId: number | undefined,
  interactionRef: React.MutableRefObject<{ draggingId: number | null; resizingId: number | null; rotatingId: number | null }>
) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);

  // 1. Initial Data Fetch
  useEffect(() => {
    if (activeBoardId === undefined || activeBoardId === null) {
      setNotes([]);
      setConnections([]);
      setIsLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      console.log("当前加载的画板ID:", activeBoardId);
      const { data: notesData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: connsData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);

      if (notesData) {
        const uniqueNotes = Array.from(new Map(notesData.map((item: any) => [item.id, mapDbToNote(item)])).values());
        setNotes(uniqueNotes);
        const maxZ = uniqueNotes.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
        setMaxZIndex(maxZ);
      } else {
        setNotes([]);
      }

      if (connsData) {
        const uniqueConns = Array.from(new Map(connsData.map((item: any) => [item.id, mapDbToConnection(item)])).values());
        setConnections(uniqueConns);
      } else {
        setConnections([]);
      }
      setIsLoading(false);
    };
    fetchInitialData();
  }, [activeBoardId]);

  // ------------------------------------------------------------
  // ✅ 核心：Realtime 实时订阅 (手动植入版 - Adapted)
  // ------------------------------------------------------------
  useEffect(() => {
    if (!activeBoardId) return;

    console.log("📡 正在建立实时连接通道...", activeBoardId);

    const channel = supabase
      .channel(`board_realtime_${activeBoardId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // 监听所有事件：增、删、改
          schema: 'public',
          table: 'notes',
          filter: `board_id=eq.${activeBoardId}`, // 只监听当前画板
        },
        (payload) => {
          console.log('🔔 收到笔记变更:', payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            // 别人加了新笔记 -> 我这边也要加
            setNotes((prev) => {
              if (prev.find((n) => n.id === newRecord.id)) return prev; // 防重
              return [...prev, mapDbToNote(newRecord)];
            });
          } else if (eventType === 'UPDATE') {
            // 别人动了笔记 -> 我这边也要动
            setNotes((prev) =>
              prev.map((n) => {
                if (n.id === newRecord.id) {
                  // Conflict Resolution: Don't update if I'm dragging this specific note
                  const current = interactionRef.current;
                  if (current.draggingId === n.id || current.resizingId === n.id || current.rotatingId === n.id) {
                    return n;
                  }
                  return mapDbToNote(newRecord);
                }
                return n;
              })
            );
          } else if (eventType === 'DELETE') {
            // 别人删了笔记 -> 我这边也要删
            setNotes((prev) => prev.filter((n) => n.id !== oldRecord.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections', // 别忘了连线也要监听！
          filter: `board_id=eq.${activeBoardId}`,
        },
        (payload) => {
          console.log('🕸️ 收到连线变更:', payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'INSERT') {
            setConnections((prev) => {
              if (prev.find((c) => c.id === newRecord.id)) return prev;
              return [...prev, mapDbToConnection(newRecord)];
            });
          } else if (eventType === 'UPDATE') {
            setConnections((prev) =>
              prev.map((c) => (c.id === newRecord.id ? mapDbToConnection(newRecord) : c))
            );
          } else if (eventType === 'DELETE') {
            setConnections((prev) => prev.filter((c) => c.id !== oldRecord.id));
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 订阅状态: ${status}`);
      });

    // 卸载组件时断开连接，防止内存泄漏
    return () => {
      console.log("🔌 断开实时连接");
      supabase.removeChannel(channel);
    };
  }, [activeBoardId, interactionRef]);

  // 3. Save Injection
  const saveToCloud = useCallback(async (changedNotes: Note[], changedConns: Connection[]) => {
    if (!activeBoardId) return;

    // --- NOTES HANDLING ---
    const notesToUpdate: Note[] = [];
    const notesToInsert: Note[] = [];

    changedNotes.forEach(n => {
      if (n.id && n.id > 0) notesToUpdate.push(n);
      else notesToInsert.push(n);
    });

    // A. Updates: Must NOT include 'id' in the body to avoid 400 Bad Request
    if (notesToUpdate.length > 0) {
      await Promise.all(notesToUpdate.map(async (n) => {
        const rawDb = mapNoteToDb({ ...n, board_id: activeBoardId });
        const payload = sanitizeNoteForInsert(rawDb);
        if ('id' in payload) delete (payload as any).id;
        await supabase.from('notes').update(payload).eq('id', n.id);
      }));
    }

    // B. Inserts: Can batch
    if (notesToInsert.length > 0) {
      const payloads = notesToInsert.map(n => {
        const rawDb = mapNoteToDb({ ...n, board_id: activeBoardId });
        const payload = sanitizeNoteForInsert(rawDb);
        if ('id' in payload) delete (payload as any).id;
        return payload;
      });
      await supabase.from('notes').insert(payloads);
    }

    // --- CONNECTIONS HANDLING (Unified Upsert) ---
    if (changedConns.length > 0) {
      const payloads = changedConns.map(c => {
        const rawDb = mapConnectionToDb({ ...c, board_id: activeBoardId });
        const payload = sanitizeConnectionForInsert(rawDb);
        // 🟢 CRITICAL: Remove 'id' so Supabase doesn't try to update by PK, 
        // allowing onConflict to work on (source, target).
        if ('id' in payload) delete (payload as any).id;
        return payload;
      });

      // 🚀 UPSERT: Insert or Update based on (source_id, target_id)
      const { error: connError } = await supabase
        .from('connections')
        .upsert(payloads, {
          onConflict: 'source_id, target_id',
          ignoreDuplicates: false
        });

      if (connError) {
        console.error("🚨 【连接线 Upsert 失败】", {
          "错误信息": connError.message,
          "详情": connError.details,
          "Hint": connError.hint,
          "Payload": payloads
        });
      }
    }
  }, [activeBoardId]);

  const deleteFromCloud = useCallback(async (noteId?: number, connId?: number) => {
    if (noteId) await supabase.from('notes').delete().eq('id', noteId);
    if (connId) await supabase.from('connections').delete().eq('id', connId);
  }, []);

  const handleDeleteNote = useCallback((id: number) => {
    const targetNote = notes.find(n => n.id === id);
    if (targetNote && targetNote.file_id) {
      deleteImageFromDrive(targetNote.file_id);
    }

    const nextNotes = notes.filter(n => n.id !== id);
    const nextConns = connections.filter(c => c.sourceId !== id && c.targetId !== id);
    setNotes(nextNotes);
    setConnections(nextConns);
    deleteFromCloud(id);
    const relatedConns = connections.filter(c => c.sourceId === id || c.targetId === id);
    relatedConns.forEach(c => deleteFromCloud(undefined, c.id));
  }, [notes, connections, deleteFromCloud]);

  const handleDeleteConnection = useCallback((id: number) => {
    const nextConns = connections.filter(c => c.id !== id);
    setConnections(nextConns);
    deleteFromCloud(undefined, id);
  }, [connections, deleteFromCloud]);

  const clearBoard = useCallback(async () => {
    if (window.confirm("Burn all evidence?")) {
      setNotes([]);
      setConnections([]);
      await supabase.from('notes').delete().eq('board_id', activeBoardId);
      await supabase.from('connections').delete().eq('board_id', activeBoardId);
    }
  }, [activeBoardId]); // Added dependency

  const updateNote = useCallback((updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
    saveToCloud([updatedNote], []);
  }, [saveToCloud]);

  return {
    notes,
    setNotes,
    connections,
    setConnections,
    isLoading,
    maxZIndex,
    setMaxZIndex,
    saveToCloud,
    deleteFromCloud,
    handleDeleteNote,
    handleDeleteConnection,
    clearBoard,
    updateNote
  };
};
