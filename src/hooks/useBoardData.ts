import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Note, Connection } from '../types';
import { deleteImageFromDrive } from '../api';
import { mapDbToNote, mapNoteToDb, mapDbToConnection, mapConnectionToDb } from '../utils';

export const useBoardData = (
  activeBoardId: number | undefined,
  interactionRef: React.MutableRefObject<{ draggingId: number | null; resizingId: number | null; rotatingId: number | null }>
) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);

  // 实时订阅
  useEffect(() => {
    if (activeBoardId === undefined || activeBoardId === null) {
      setNotes([]);
      setConnections([]);
      setIsLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      console.log("当前加载的画板ID:", activeBoardId);
      // 1. Query Filter

      const { data: notesData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: connsData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);

      if (notesData) {
        // Map DB record -> Note object
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

    // 2. Subscription Filter
    const channel = supabase.channel(`detective-wall-changes-${activeBoardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newNote = mapDbToNote(payload.new);
          setNotes(prev => prev.some(n => n.id === newNote.id) ? prev : [...prev, newNote]);
        } else if (payload.eventType === 'UPDATE') {
          const newNote = mapDbToNote(payload.new);
          setNotes(prev => prev.map(n => {
            // Conflict Resolution
            const current = interactionRef.current;
            if (n.id === newNote.id && (current.draggingId === n.id || current.resizingId === n.id || current.rotatingId === n.id)) {
              return n;
            }
            return n.id === newNote.id ? newNote : n;
          }));
        } else if (payload.eventType === 'DELETE') setNotes(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `board_id=eq.${activeBoardId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newConn = mapDbToConnection(payload.new);
          setConnections(prev => prev.some(c => c.id === newConn.id) ? prev : [...prev, newConn]);
        }
        else if (payload.eventType === 'UPDATE') {
          const newConn = mapDbToConnection(payload.new);
          setConnections(prev => prev.map(c => c.id === newConn.id ? newConn : c));
        }
        else if (payload.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

        // 🟢 SANITIZE: Removes ID and enforces types
        const payload = sanitizeNoteForInsert(rawDb);

        // 🛡️ Double Check: Ensure ID is gone
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

    // --- CONNECTIONS HANDLING ---
    const connsToUpdate: Connection[] = [];
    const connsToInsert: Connection[] = [];

    changedConns.forEach(c => {
      if (c.id && c.id > 0) connsToUpdate.push(c);
      else connsToInsert.push(c);
    });

    if (connsToUpdate.length > 0) {
      await Promise.all(connsToUpdate.map(async (c) => {
        const rawDb = mapConnectionToDb({ ...c, board_id: activeBoardId });
        if (rawDb.id) delete rawDb.id; // Manual ID removal
        await supabase.from('connections').update(rawDb).eq('id', c.id);
      }));
    }

    if (connsToInsert.length > 0) {
      const payloads = connsToInsert.map(c => {
        const rawDb = mapConnectionToDb({ ...c, board_id: activeBoardId });
        if (rawDb.id) delete rawDb.id;
        return rawDb;
      });
      await supabase.from('connections').insert(payloads);
    }
  }, [activeBoardId]);

  const deleteFromCloud = useCallback(async (noteId?: number, connId?: number) => {
    // Note: Deletion usually doesn't require board_id if ID is unique, but RLS might require it. 
    // User asked NOT to modify deletion logic, so keeping as is (deleting by ID).
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
      // Ensure we only clear CURRENT board
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
