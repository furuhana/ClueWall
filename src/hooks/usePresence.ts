import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserCursor } from '../types';
import { getCursorColor } from '../utils';

export const usePresence = (boardId: number | undefined, userName: string | null) => {
    const [otherUsers, setOtherUsers] = useState<UserCursor[]>([]);
    const [mySessionId] = useState(() => Math.random().toString(36).substr(2, 9));
    const channelRef = useRef<any>(null);
    const lastBroadcastRef = useRef<number>(0);

    useEffect(() => {
        if (!boardId) return;

        const channel = supabase.channel(`presence_${boardId}`, {
            config: {
                presence: {
                    key: mySessionId,
                },
            },
        });

        channelRef.current = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                // Presence state handling if needed for user list (optional depending on broadcast)
                // For mouse tracking, we rely heavily on broadcast for frequency
            })
            .on('broadcast', { event: 'cursor-pos' }, (payload: { payload: UserCursor }) => {
                const cursor = payload.payload;
                if (cursor.sessionId === mySessionId) return;

                setOtherUsers((prev) => {
                    const index = prev.findIndex((u) => u.sessionId === cursor.sessionId);
                    if (index === -1) {
                        return [...prev, cursor];
                    }
                    const newUsers = [...prev];
                    newUsers[index] = cursor;
                    return newUsers;
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        sessionId: mySessionId,
                        username: userName || 'Anonymous',
                        online_at: new Date().toISOString(),
                    });
                }
            });

        // Cleanup zombies every 10s
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setOtherUsers(prev => prev.filter(u => now - u.lastUpdated < 10000));
        }, 10000);

        return () => {
            clearInterval(cleanupInterval);
            supabase.removeChannel(channel);
        };
    }, [boardId, mySessionId, userName]);

    const broadcastMouse = useCallback((x: number, y: number) => {
        if (!channelRef.current) return;

        const now = Date.now();
        if (now - lastBroadcastRef.current < 50) return; // 50ms throttle

        lastBroadcastRef.current = now;

        const cursor: UserCursor = {
            sessionId: mySessionId,
            userId: null, // Optional
            username: userName || 'Anonymous',
            x,
            y,
            color: getCursorColor(mySessionId),
            lastUpdated: now
        };

        channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-pos',
            payload: cursor,
        });
    }, [userName, mySessionId]);

    return { otherUsers, broadcastMouse };
};
