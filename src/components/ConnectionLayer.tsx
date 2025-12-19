import React, { useState, useRef } from 'react';
import { Connection, Note } from '../types';
import { getNoteDimensions } from '../utils';
import { X } from 'lucide-react';

interface ConnectionLayerProps {
  connections: Connection[];
  notes: Note[];
  connectingNodeId: number | null;
  mousePos: { x: number; y: number };
  onDeleteConnection: (id: number) => void;
  onPinClick: (e: React.MouseEvent, id: number) => void;
  isPinMode: boolean;
  onConnectionColorChange?: (id: number, color: string) => void;
  onPinMouseDown: (e: React.MouseEvent, id: number) => void;
}

// Color Constants
const COLORS = {
  RED: '#D43939',
  GREEN: '#1FB0A6',
  PURPLE: '#7F67CC'
};

const CONNECTION_STYLES: Record<string, { stroke: string; filter: string }> = {
  [COLORS.RED]: {
    stroke: COLORS.RED,
    filter: 'drop-shadow(0 4px 16.6px rgba(191, 0, 0, 0.40)) drop-shadow(0 6px 6.3px rgba(147, 0, 0, 0.30))'
  },
  [COLORS.GREEN]: {
    stroke: COLORS.GREEN,
    filter: 'drop-shadow(0 4px 16.6px rgba(29, 168, 160, 0.40)) drop-shadow(0 6px 6.3px rgba(29, 88, 84, 0.30))'
  },
  [COLORS.PURPLE]: {
    stroke: COLORS.PURPLE,
    filter: 'drop-shadow(0 4px 16.6px rgba(71, 32, 196, 0.40)) drop-shadow(0 6px 6.3px rgba(78, 51, 164, 0.30))'
  }
};

const ConnectionLayer: React.FC<ConnectionLayerProps> = ({
  connections,
  notes,
  connectingNodeId,
  mousePos,
  onDeleteConnection,
  onPinClick,
  isPinMode,
  onConnectionColorChange,
  onPinMouseDown
}) => {
  const [hoveredConnId, setHoveredConnId] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = (id: number) => {
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

  const getPinLocation = (noteId: number) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return { x: 0, y: 0 };

    const { width: w, height: h } = getNoteDimensions(note);
    const cx = note.x + w / 2;
    const cy = note.y + h / 2;
    const px = note.pinX ?? w / 2;
    const py = note.pinY ?? 10;
    const dx = px - w / 2;
    const dy = py - h / 2;
    const rad = (note.rotation * Math.PI) / 180;
    const rotatedDx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const rotatedDy = dx * Math.sin(rad) + dy * Math.cos(rad);

    return { x: cx + rotatedDx, y: cy + rotatedDy };
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
      <svg className="absolute top-0 left-0 pointer-events-none z-[9999]" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
        <g>
          {connections.map((conn) => {
            const start = getPinLocation(conn.sourceId);
            const end = getPinLocation(conn.targetId);
            const activeColor = conn.color && Object.values(COLORS).includes(conn.color) ? conn.color : COLORS.RED;
            const style = CONNECTION_STYLES[activeColor] || CONNECTION_STYLES[COLORS.RED];
            const displayStroke = hoveredConnId === conn.id ? style.stroke : style.stroke;

            return (
              <g key={conn.id} className="group pointer-events-auto cursor-pointer" onMouseEnter={() => handleMouseEnter(conn.id)} onMouseLeave={handleMouseLeave}>
                {/* 隐形粗线，方便鼠标悬停 */}
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
                {/* 实际细线 */}
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={displayStroke} strokeWidth="4" strokeLinecap="round" className="transition-all duration-200" style={{ stroke: displayStroke, filter: style.filter }} />
              </g>
            );
          })}
          {connectingNodeId && (
            <line x1={getPinLocation(connectingNodeId).x} y1={getPinLocation(connectingNodeId).y} x2={mousePos.x} y2={mousePos.y} stroke="#D43939" strokeWidth="4" strokeDasharray="5,5" opacity="0.8" />
          )}
        </g>
      </svg>

      <div className="absolute top-0 left-0 pointer-events-none z-[10000]" style={{ width: '1px', height: '1px', overflow: 'visible' }}>
        {notes.map(note => {
          if (!note.hasPin) return null;
          const pos = getPinLocation(note.id);
          return (
            <div key={`pin-container-${note.id}`}>
              <div style={{ ...pinStyle, position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
              <button
                className="absolute w-8 h-8 rounded-full pointer-events-auto cursor-pointer"
                style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', backgroundColor: 'transparent', cursor: 'move' }}
                title={isPinMode ? "Connect Evidence (Switch Mode)" : "Connect Evidence / Drag to Move"}
                onClick={(e) => { e.stopPropagation(); onPinClick(e, note.id); }}
                onMouseDown={(e) => { if (e.button === 1) return; onPinMouseDown(e, note.id); }}
              />
            </div>
          );
        })}

        {connections.map(conn => {
          if (hoveredConnId !== conn.id) return null;
          const start = getPinLocation(conn.sourceId);
          const end = getPinLocation(conn.targetId);
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;

          // 计算角度
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);
          // 计算垂直方向偏移 (角度 - 90度)
          const perpAngle = angle - Math.PI / 2;
          const dist = 45; // 间距
          const offsetX = dist * Math.cos(perpAngle);
          const offsetY = dist * Math.sin(perpAngle);

          const currentColor = conn.color || COLORS.RED;
          const isGreen = currentColor === COLORS.GREEN;
          const isPurple = currentColor === COLORS.PURPLE;

          // 逻辑修正：
          // 上按钮(Top): 控制绿色。如果当前是绿，显示红(撤销)；否则显示绿(切换)。
          const topBtnColor = isGreen ? COLORS.RED : COLORS.GREEN;
          // 下按钮(Bottom): 控制紫色。如果当前是紫，显示红(撤销)；否则显示紫(切换)。
          const botBtnColor = isPurple ? COLORS.RED : COLORS.PURPLE;

          return (
            <div key={`controls-${conn.id}`} className="pointer-events-auto" style={{ position: 'absolute', left: midX, top: midY, width: 0, height: 0, overflow: 'visible' }} onMouseEnter={() => handleMouseEnter(conn.id)} onMouseLeave={handleMouseLeave}>

              {/* Top Button (Slot 1): 绿色控制位 */}
              <button
                className={`absolute w-6 h-6 rounded-full border shadow-lg hover:scale-125 transition-transform cursor-pointer pointer-events-auto flex items-center justify-center animate-in fade-in zoom-in duration-200 ${isGreen ? 'ring-2 ring-white border-transparent' : 'border-white/50'}`}
                style={{
                  backgroundColor: topBtnColor,
                  transform: `translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`
                }}
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  // 逻辑：如果按钮显示红色(意味着当前是绿)，则切回红；如果显示绿色，则切成绿
                  const nextColor = topBtnColor === COLORS.RED ? COLORS.RED : COLORS.GREEN;
                  onConnectionColorChange && onConnectionColorChange(conn.id, nextColor);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />

              {/* Center Delete Button */}
              <button
                className="absolute w-8 h-8 bg-white border-2 border-red-600 rounded-full flex items-center justify-center text-red-600 shadow-lg hover:bg-red-50 hover:scale-110 transition-transform cursor-pointer pointer-events-auto animate-in fade-in zoom-in duration-200 z-10"
                style={{ transform: 'translate(-50%, -50%)' }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteConnection(conn.id); }}
                onMouseDown={(e) => { if (e.button !== 1) e.stopPropagation(); }}
              >
                <X size={16} strokeWidth={3} />
              </button>

              {/* Bottom Button (Slot 2): 紫色控制位 */}
              <button
                className={`absolute w-6 h-6 rounded-full border shadow-lg hover:scale-125 transition-transform cursor-pointer pointer-events-auto flex items-center justify-center animate-in fade-in zoom-in duration-200 ${isPurple ? 'ring-2 ring-white border-transparent' : 'border-white/50'}`}
                style={{
                  backgroundColor: botBtnColor,
                  transform: `translate(${-offsetX}px, ${-offsetY}px) translate(-50%, -50%)`
                }}
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  // 逻辑：如果按钮显示红色(意味着当前是紫)，则切回红；如果显示紫色，则切成紫
                  const nextColor = botBtnColor === COLORS.RED ? COLORS.RED : COLORS.PURPLE;
                  onConnectionColorChange && onConnectionColorChange(conn.id, nextColor);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ConnectionLayer;