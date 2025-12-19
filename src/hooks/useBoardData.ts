import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Note, Connection } from '../types';
import { deleteImageFromDrive } from '../api';

export const useBoardData = (
  activeBoardId: string,
  interactionRef: React.MutableRefObject<{ draggingId: string | null; resizingId: string | null; rotatingId: string | null }>
) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxZIndex, setMaxZIndex] = useState<number>(10);

  // 实时订阅
  useEffect(() => {
    const fetchInitialData = async () => {
      // 1. Query Filter
      const { data: notesData } = await supabase.from('notes').select('*').eq('board_id', activeBoardId);
      const { data: connsData } = await supabase.from('connections').select('*').eq('board_id', activeBoardId);

      if (notesData) {
        const uniqueNotes = Array.from(new Map(notesData.map((item: any) => [item.id, item])).values());
        setNotes(uniqueNotes as any);
        const maxZ = notesData.reduce((max: number, n: any) => Math.max(max, n.zIndex || 0), 10);
        setMaxZIndex(maxZ);
      } else {
        setNotes([]);
      }

      if (connsData) {
        const uniqueConns = Array.from(new Map(connsData.map((item: any) => [item.id, item])).values());
        setConnections(uniqueConns as any);
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
          setNotes(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, payload.new as Note]);
        } else if (payload.eventType === 'UPDATE') {
          const newNote = payload.new as Note;
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
          setConnections(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new as Connection]);
        }
        else if (payload.eventType === 'UPDATE') { const newConn = payload.new as Connection; setConnections(prev => prev.map(c => c.id === newConn.id ? newConn : c)); }
        else if (payload.eventType === 'DELETE') setConnections(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBoardId, interactionRef]);

  // 3. Save Injection
  const saveToCloud = useCallback(async (changedNotes: Note[], changedConns: Connection[]) => {
    if (changedNotes.length > 0) {
      const notesToSave = changedNotes.map(n => ({ ...n, board_id: activeBoardId }));
      await supabase.from('notes').upsert(notesToSave);
    }
    if (changedConns.length > 0) {
      const connsToSave = changedConns.map(c => ({ ...c, board_id: activeBoardId }));
      await supabase.from('connections').upsert(connsToSave);
    }
  }, [activeBoardId]);

  const deleteFromCloud = useCallback(async (noteId?: string, connId?: string) => {
    // Note: Deletion usually doesn't require board_id if ID is unique, but RLS might require it. 
    // User asked NOT to modify deletion logic, so keeping as is (deleting by ID).
    if (noteId) await supabase.from('notes').delete().eq('id', noteId);
    if (connId) await supabase.from('connections').delete().eq('id', connId);
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    const targetNote = notes.find(n => n.id === id);
    if (targetNote && targetNote.fileId) {
      deleteImageFromDrive(targetNote.fileId);
    }

    const nextNotes = notes.filter(n => n.id !== id);
    const nextConns = connections.filter(c => c.sourceId !== id && c.targetId !== id);
    setNotes(nextNotes);
    setConnections(nextConns);
    deleteFromCloud(id);
    const relatedConns = connections.filter(c => c.sourceId === id || c.targetId === id);
    relatedConns.forEach(c => deleteFromCloud(undefined, c.id));
  }, [notes, connections, deleteFromCloud]);

  const handleDeleteConnection = useCallback((id: string) => {
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
