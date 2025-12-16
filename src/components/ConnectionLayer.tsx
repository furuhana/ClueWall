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
  onConnectionColorChange?: (id: string, color: string) => void;
  onPinMouseDown: (e: React.MouseEvent, id: string) => void;
}

const COLORS = { RED: '#D43939', GREEN: '#1FB0A6', PURPLE: '#7F67CC' };
const CONNECTION_STYLES: Record<string, { stroke: string; filter: string }> = {
    [COLORS.RED]: { stroke: COLORS.RED, filter: 'drop-shadow(0 4px 6px rgba(191, 0, 0, 0.4))' },
    [COLORS.GREEN]: { stroke: COLORS.GREEN, filter: 'drop-shadow(0 4px 6px rgba(29, 168, 160, 0.4))' },
    [COLORS.PURPLE]: { stroke: COLORS.PURPLE, filter: 'drop-shadow(0 4px 6px rgba(71, 32, 196, 0.4))' }
};

const ConnectionLayer: React.FC<ConnectionLayerProps> = ({ connections, notes, connectingNodeId, mousePos, onDeleteConnection, onPinClick, isPinMode, onConnectionColorChange, onPinMouseDown }) => {
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = (id: string) => {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    setHoveredConnId(id);
  };
  const handleMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => setHoveredConnId(null), 300);
  };

  const getPinLocation = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return { x: 0, y: 0 };
    const { width: w, height: h } = getNoteDimensions(note);
    const cx = note.x + w / 2; const cy = note.y + h / 2;
    const px = note.pinX ?? w / 2; const py = note.pinY ?? 10;
    const dx = px - w / 2; const dy = py - h / 2;
    const rad = (note.rotation * Math.PI) / 180;
    const rotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: cx + rotatedDx, y: cy + rotatedDy };
  };

  const pinStyle: React.CSSProperties = { width: '20px', height: '20px', borderRadius: '50%', background: 'radial-gradient(at 30% 30%, #ddd, #999)', boxShadow: '1px 1px 3px rgba(0,0,0,0.5)', zIndex: 50 };

  return (
    <>
      <svg className="absolute top-0 left-0 pointer-events-none z-[9999]" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
        <g>
          {connections.map((conn) => {
            const start = getPinLocation(conn.sourceId); const end = getPinLocation(conn.targetId);
            const activeColor = conn.color && Object.values(COLORS).includes(conn.color) ? conn.color : COLORS.RED;
            const style = CONNECTION_STYLES[activeColor];
            return (
              <g key={conn.id} className="pointer-events-auto cursor-pointer" onMouseEnter={() => handleMouseEnter(conn.id)} onMouseLeave={handleMouseLeave}>
                 {/* Invisible wide stroke for easier hovering */}
                 <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
                 {/* Visible line */}
                 <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={style.stroke} strokeWidth="4" strokeLinecap="round" style={{ filter: style.filter }} />
              </g>
            );
          })}
          {connectingNodeId && <line x1={getPinLocation(connectingNodeId).x} y1={getPinLocation(connectingNodeId).y} x2={mousePos.x} y2={mousePos.y} stroke="#D43939" strokeWidth="4" strokeDasharray="5,5" opacity="0.8" />}
        </g>
      </svg>

      <div className="absolute top-0 left-0 pointer-events-none z-[10000]" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
        {notes.map(note => {
            if (!note.hasPin) return null;
            const pos = getPinLocation(note.id);
            return (
                <div key={`pin-${note.id}`} style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}>
                    <div style={pinStyle} />
                    <button className="absolute inset-0 rounded-full pointer-events-auto cursor-crosshair" onClick={(e) => { e.stopPropagation(); onPinClick(e, note.id); }} onMouseDown={(e) => { if (e.button !== 1) onPinMouseDown(e, note.id); }} />
                </div>
            );
        })}

        {connections.map(conn => {
            if (hoveredConnId !== conn.id) return null;
            const start = getPinLocation(conn.sourceId); const end = getPinLocation(conn.targetId);
            const midX = (start.x + end.x) / 2; const midY = (start.y + end.y) / 2;
            const currentColor = conn.color || COLORS.RED;
            const topColor = currentColor === COLORS.GREEN ? COLORS.RED : COLORS.GREEN;
            const bottomColor = currentColor === COLORS.PURPLE ? COLORS.RED : COLORS.PURPLE;

            return (
                <div key={`controls-${conn.id}`} onMouseEnter={() => handleMouseEnter(conn.id)} onMouseLeave={handleMouseLeave} className="pointer-events-auto" style={{ position: 'absolute', left: midX, top: midY, transform: 'translate(-50%, -50%)' }}>
                    <button className="absolute w-6 h-6 rounded-full border shadow-md hover:scale-110 transition-transform" style={{ backgroundColor: topColor, transform: 'translate(-50%, -40px)' }} onClick={(e) => { e.stopPropagation(); onConnectionColorChange && onConnectionColorChange(conn.id, topColor); }} onMouseDown={e => e.stopPropagation()} />
                    <button className="w-8 h-8 bg-white border-2 border-red-600 rounded-full flex items-center justify-center text-red-600 shadow-md hover:bg-red-50 hover:scale-110 transition-transform" onClick={(e) => { e.stopPropagation(); onDeleteConnection(conn.id); }} onMouseDown={e => e.stopPropagation()}><X size={16} strokeWidth={3} /></button>
                    <button className="absolute w-6 h-6 rounded-full border shadow-md hover:scale-110 transition-transform" style={{ backgroundColor: bottomColor, transform: 'translate(-50%, 15px)' }} onClick={(e) => { e.stopPropagation(); onConnectionColorChange && onConnectionColorChange(conn.id, bottomColor); }} onMouseDown={e => e.stopPropagation()} />
                </div>
            );
        })}
      </div>
    </>
  );
};
export default ConnectionLayer;