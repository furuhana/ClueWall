// 仅供参考：请检查你的 components/ConnectionLayer.tsx
import React from 'react';
import { Connection, Note } from '../types';
import { Trash2 } from 'lucide-react';

// ... (Interface definitions)

const ConnectionLayer: React.FC<any> = ({ connections, notes, onDeleteConnection, onConnectionColorChange }) => {
  // ... (Calculation logic)

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
      {connections.map(conn => {
        // ... (Path calculation)
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        return (
          <g key={conn.id} className="pointer-events-auto group">
            <path d={pathData} stroke={conn.color} strokeWidth="3" fill="none" />
            
            {/* 🟢 修复布局：使用 foreignObject 包裹 HTML 按钮实现垂直布局 */}
            <foreignObject x={midX - 20} y={midY - 45} width="40" height="90">
              <div className="flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full py-1">
                {/* 颜色按钮 1 */}
                <button 
                  onClick={() => onConnectionColorChange(conn.id, '#D43939')} 
                  className="w-4 h-4 rounded-full bg-[#D43939] border border-white hover:scale-125 transition-transform" 
                />
                
                {/* 删除按钮 (中间) */}
                <button 
                  onClick={() => onDeleteConnection(conn.id)}
                  className="p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                >
                  <Trash2 size={12} />
                </button>

                {/* 颜色按钮 2 */}
                <button 
                   onClick={() => onConnectionColorChange(conn.id, '#3b82f6')} 
                   className="w-4 h-4 rounded-full bg-[#3b82f6] border border-white hover:scale-125 transition-transform" 
                />
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
};

export default ConnectionLayer;