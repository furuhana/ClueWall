import React from 'react';
import { UserCursor } from '../types';

interface CursorLayerProps {
    otherUsers: UserCursor[];
    view: { x: number; y: number; zoom: number };
}

export const CursorLayer: React.FC<CursorLayerProps> = ({ otherUsers, view }) => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
            {otherUsers.map((user) => {
                // Transform World Coordinates -> Screen Coordinates
                const screenX = user.x * view.zoom + view.x;
                const screenY = user.y * view.zoom + view.y;

                return (
                    <div
                        key={user.sessionId}
                        className="absolute transition-transform duration-100 ease-linear"
                        style={{
                            transform: `translate(${screenX}px, ${screenY}px)`,
                            color: user.color,
                        }}
                    >
                        {/* SVG Arrow */}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ filter: 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))' }}
                        >
                            <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z" />
                        </svg>
                        {/* No name label on cursor as requested, only color distinction */}
                    </div>
                );
            })}
        </div>
    );
};
