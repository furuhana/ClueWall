import React from 'react';
import { UserCursor } from '../types';

interface PresenceBarProps {
    otherUsers: UserCursor[];
    myColor?: string;
    myUserName?: string;
}

export const PresenceBar: React.FC<PresenceBarProps> = ({ otherUsers, myUserName }) => {
    // Deduplicate users by sessionId just in case, though hook handles it.
    // We can also sort by recent activity.

    return (
        <div className="fixed bottom-4 left-[280px] z-[50] flex flex-col gap-2 pointer-events-none">
            <div className="bg-black/80 backdrop-blur-md rounded-lg p-3 text-white text-xs border border-white/10 shadow-xl pointer-events-auto max-h-[200px] overflow-y-auto w-48">
                <div className="font-bold mb-2 text-gray-400 uppercase tracking-widest text-[10px]">
                    Active Agents ({otherUsers.length + 1})
                </div>

                {/* Me */}
                <div className="flex items-center gap-2 mb-1 opacity-50">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="truncate">{myUserName || 'You'} (Me)</span>
                </div>

                {/* Others */}
                {otherUsers.map(user => (
                    <div key={user.sessionId} className="flex items-center gap-2 mb-1">
                        <div
                            className="w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]"
                            style={{ backgroundColor: user.color, color: user.color }}
                        />
                        <span className="truncate">{user.username}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
