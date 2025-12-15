import React, { useState, useRef } from 'react';
import { Connection, Note } from '../types';
import { getNoteDimensions } from '../utils';
import { X } from 'lucide-react';

interface ConnectionLayerProps {
  connections: Connection[];
  notes: Note[];
  connectingNodeId: string | null;
  mousePos: { x: number; y: number };
  onDeleteConnection: (id: string) => void;
  onPinClick: (e: React.MouseEvent, id: string) => void; 
  isPinMode: boolean; 
}

const ConnectionLayer: React.FC<ConnectionLayerProps> = ({ 
  connections, 
  notes, 
  connectingNodeId,
  mousePos,
  onDeleteConnection,
  onPinClick,
  isPinMode
}) => {
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = (id: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredConnId(id);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredConnId(null);
    }, 150);
  };

  const getPinLocation = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return { x: 0, y: 0 };
    
    // Use the helper to ensure we match the visuals
    const { width: w, height: h } = getNoteDimensions(note);

    // Center of the note (rotation pivot)
    const cx = note.x + w / 2;
    const cy = note.y + h / 2;

    // Pin position relative to top-left (0,0) of the unrotated note
    // Default pin is at Top Center if not specified
    const px = note.pinX ?? w / 2;
    const py = note.pinY ?? 10;

    // Vector from Center to Pin (Unrotated)
    const dx = px - w / 2;
    const dy = py - h / 2;

    // Rotate this vector by the note's rotation
    const rad = (note.rotation * Math.PI) / 180;
    const rotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);

    return {
      x: cx + rotatedDx,
      y: cy + rotatedDy, 
    };
  };

  const pinStyle: React.CSSProperties = {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'radial-gradient(66.67% 66.67% at 50% 33.33%, rgb(194, 194, 194) 34.29%, rgb(164, 164, 164) 100%)',
    boxShadow: 'rgb(255, 255, 255) 0px 0.5px 0px 0px inset, rgb(255, 255, 255) 0px 1px 1px 0px inset, rgba(0, 0, 0, 0.3) 0px -0.5px 1px 0.5px inset, rgba(0, 0, 0, 0.4) 0px -0.5px 0.5px 0px inset, rgba(255, 255, 255, 0.5) 0px 0px 4.2px 0px inset',
    filter: 'drop-shadow(rgba(40, 0, 0, 0.4) 0px 6px 4px) drop-shadow(rgba(0, 0, 0, 0.5) 0px 8px 12.7px)'
  };

  return (
    <>
      {/* SVG Layer: High Z-Index to ensure lines appear above nodes */}
      {/* FIXED: Added style={{ overflow: 'visible' }} and 1px dimensions to prevent browser culling */}
      <svg 
        className="absolute top-0 left-0 pointer-events-none z-[9999]"
        style={{ width: '1px', height: '1px', overflow: 'visible' }}
      >
        {/* Lines */}
        <g>
          {connections.map((conn) => {
            const start = getPinLocation(conn.sourceId);
            const end = getPinLocation(conn.targetId);

            return (
              <g 
                key={conn.id} 
                className="group pointer-events-auto cursor-pointer"
                onMouseEnter={() => handleMouseEnter(conn.id)}
                onMouseLeave={handleMouseLeave}
              >
                 {/* Invisible wide stroke for easier hovering */}
                 <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth="20" 
                  strokeLinecap="round"
                />
                {/* Visible string - New Red Style */}
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="#D43939"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="transition-colors duration-200"
                  style={{ 
                    stroke: hoveredConnId === conn.id ? '#ff6666' : '#D43939',
                    filter: 'drop-shadow(0 4px 16.6px rgba(191, 0, 0, 0.40)) drop-shadow(0 6px 6.3px rgba(147, 0, 0, 0.30))'
                  }}
                />
              </g>
            );
          })}

          {/* Dragging Line Preview */}
          {connectingNodeId && (
            <line
              x1={getPinLocation(connectingNodeId).x}
              y1={getPinLocation(connectingNodeId).y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke="#d93025"
              strokeWidth="4"
              strokeDasharray="5,5"
              opacity="0.8"
            />
          )}
        </g>
      </svg>

      {/* HTML Overlay: Pins and Buttons */}
      <div 
        className="absolute top-0 left-0 pointer-events-none z-[10000]"
        style={{ width: '1px', height: '1px', overflow: 'visible' }}
      >
        {/* Pins (Now rendered as HTML for complex styles) and Click Targets */}
        {notes.map(note => {
            if (!note.hasPin) return null;
            const pos = getPinLocation(note.id);
            return (
                <div key={`pin-container-${note.id}`}>
                    {/* Visual Pin Div */}
                    <div 
                        style={{
                            ...pinStyle,
                            position: 'absolute',
                            left: pos.x,
                            top: pos.y,
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none' // Clicks go through to button below
                        }}
                    />
                    
                    {/* Interactive Button (Transparent) */}
                    <button
                        className="absolute w-8 h-8 rounded-full pointer-events-auto cursor-pointer"
                        style={{
                            left: pos.x,
                            top: pos.y,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: 'transparent',
                        }}
                        title={isPinMode ? "Remove Pin" : "Connect Evidence"}
                        onClick={(e) => {
                            e.stopPropagation();
                            onPinClick(e, note.id);
                        }}
                        onMouseDown={(e) => {
                             // Allow middle mouse to bubble for panning
                             if (e.button === 1) return;
                             
                             e.stopPropagation();
                             if (isPinMode) {
                                onPinClick(e, note.id); 
                             }
                        }}
                    />
                </div>
            );
        })}

        {/* Delete Buttons for Connections */}
        {connections.map(conn => {
            if (hoveredConnId !== conn.id) return null;
            const start = getPinLocation(conn.sourceId);
            const end = getPinLocation(conn.targetId);
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;

            return (
              <button
                key={`btn-${conn.id}`}
                className="absolute w-8 h-8 bg-white border-2 border-red-600 rounded-full flex items-center justify-center text-red-600 shadow-lg hover:bg-red-50 hover:scale-110 transition-transform cursor-pointer pointer-events-auto animate-in fade-in zoom-in duration-200"
                style={{ 
                  left: midX, 
                  top: midY,
                  transform: 'translate(-50%, -50%)'
                }}
                onMouseEnter={() => handleMouseEnter(conn.id)}
                onMouseLeave={handleMouseLeave}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); 
                  onDeleteConnection(conn.id);
                }}
                onMouseDown={(e) => {
                  if (e.button !== 1) e.stopPropagation();
                }}
              >
                <X size={16} strokeWidth={3} />
              </button>
            );
        })}
      </div>
    </>
  );
};

export default ConnectionLayer;