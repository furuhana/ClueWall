import React, { useRef, useLayoutEffect } from 'react';
import { Note } from '../types';
import { NODE_WIDTH } from '../constants';
import { Paperclip, FileText, MapPin, Trash2, Maximize, RotateCw, MoveHorizontal, MoveVertical } from 'lucide-react';

interface DetectiveNodeProps {
  note: Note;
  onMouseDown: (e: React.MouseEvent, id: number) => void;
  onDoubleClick: (id: number) => void;
  isConnecting: boolean;
  isSelectedForConnection: boolean;
  isPinMode: boolean;
  isSelected: boolean;
  isMultiSelected: boolean; // 🟢 新增：是否处于多选状态
  onDelete: () => void;
  onStartPin: () => void;
  onResize: (id: number, width: number, height: number) => void;
  onRotateStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, mode: 'CORNER' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM') => void;
}

// ... (样式常量 noteStyle, photoStyle 等保持不变，为了节省篇幅省略，请保留原来的样式代码) ...
// ⚠️ 如果你没有备份样式代码，请告诉我，我再发一遍完整的。这里假设你保留了原来的样式定义。
const noteStyle: React.CSSProperties = { borderRadius: '12px', backgroundImage: `linear-gradient(transparent 27px, rgba(94, 110, 128, 0.2) 28px), linear-gradient(180deg, #FFF293 0%, #DFC765 100%)`, backgroundSize: '100% 28px, 100% 100%', backgroundAttachment: 'local', lineHeight: '28px', boxShadow: `0 15px 10px -18px #000, 0 14px 12.2px -9px rgba(0, 0, 0, 0.25), 0 57px 43.8px -38px rgba(0, 0, 0, 0.25), 0 2px 0 0 #FFF5A6 inset, 0 2px 4px 0 rgba(181, 118, 0, 0.30) inset, 0 -2px 2px 0 rgba(91, 50, 21, 0.40) inset, 0 -5px 47.2px 0 rgba(205, 168, 48, 0.10) inset` };
const photoStyle: React.CSSProperties = { borderRadius: '12px', background: 'radial-gradient(79.89% 90.55% at 50% 34.36%, #FBFBFB 0%, #DBDBDB 84.87%)', boxShadow: '0 15px 10px -18px #000, 0 14px 12.2px -9px rgba(0, 0, 0, 0.25), 0 57px 43.8px -38px rgba(0, 0, 0, 0.25), 0 2px 0 0 #FFF inset, 0 2px 4px 0 rgba(162, 162, 162, 0.30) inset, 0 -2px 2px 0 rgba(0, 0, 0, 0.40) inset, 0 -5px 47.2px 0 rgba(0, 0, 0, 0.10) inset' };
const dossierTabStyle: React.CSSProperties = { borderRadius: '12px 12px 0 0', background: 'linear-gradient(180deg, #DBB895 17.29%, #BD937C 86.6%)', boxShadow: '0 2px 0 0 rgba(0, 0, 0, 0.25), 0 57px 43.8px -38px rgba(0, 0, 0, 0.25), 0 1px 2px 0 #FFE6D0 inset, 0 2px 4px 0 rgba(192, 140, 102, 0.30) inset, 0 -2px 2px 0 rgba(76, 36, 19, 0.40) inset, 0 -5px 47.2px 0 rgba(167, 92, 45, 0.10) inset' };
const dossierStyle: React.CSSProperties = { borderRadius: '12px', background: 'linear-gradient(180deg, #E6CCB2 0%, #DBB895 100%)', boxShadow: '0 15px 10px -18px #000, 0 14px 12.2px -9px rgba(0, 0, 0, 0.25), 0 57px 43.8px -38px rgba(0, 0, 0, 0.25), 0 2px 2px 0 #FFE6D0 inset, 0 2px 4px 0 rgba(192, 140, 102, 0.30) inset, 0 -2px 2px 0 rgba(76, 36, 19, 0.40) inset, 0 -5px 47.2px 0 rgba(167, 92, 45, 0.10) inset' };
const scrapStyle: React.CSSProperties = { borderRadius: '4px', background: 'linear-gradient(180deg, #FBFBFB -21.09%, #DBDBDB 190%)', boxShadow: '0 2px 6px -4px #000, 0 3px 2px -2px #FFF inset, 0 -5px 47.2px 0 rgba(0, 0, 0, 0.10) inset' };
const markerStyle: React.CSSProperties = { borderRadius: '1px', background: 'linear-gradient(180deg, #CFDFEE -50%, #ABBDD7 150%)', boxShadow: '0 3.5px 0 -2px #EAF5FF inset, 0 0 1px 0 rgba(236, 250, 255, 0.50) inset, 0 6px 2px -6px rgba(126, 179, 229, 0.70) inset, 0 -6px 1px -6px rgba(82, 113, 144, 0.70) inset, 0 -6px 4.2px -6px #6A95B4 inset, -6px -4px 3.6px -6px rgba(0, 0, 0, 0.10), 6px -4px 3.6px -6px rgba(0, 0, 0, 0.10), 2px 0 2px -2px rgba(0, 0, 0, 0.40), -2px 0 2px -2px rgba(0, 0, 0, 0.40)', };

const DetectiveNode: React.FC<DetectiveNodeProps> = ({ note, onMouseDown, onDoubleClick, isSelectedForConnection, isPinMode, isSelected, isMultiSelected, onDelete, onStartPin, onResize, onRotateStart, onResizeStart }) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (nodeRef.current) {
      const { offsetWidth, offsetHeight } = nodeRef.current;
      if (Math.abs((note.width || 0) - offsetWidth) > 1 || Math.abs((note.height || 0) - offsetHeight) > 1) {
        onResize(note.id, offsetWidth, offsetHeight);
      }
    }
  });

  const isTextType = ['note', 'dossier', 'scrap'].includes(note.type);
  const currentScale = isTextType ? (note.scale || 1) : 1;
  const currentWidth = note.width || NODE_WIDTH;

  const containerStyle: React.CSSProperties = { position: 'absolute', left: note.x, top: note.y, width: currentWidth, height: note.height || 'auto', zIndex: note.zIndex, transform: `rotate(${note.rotation}deg)`, transformOrigin: 'center center', cursor: isPinMode ? 'crosshair' : 'move', };
  const innerWrapperStyle: React.CSSProperties = isTextType ? { width: `${currentWidth / currentScale}px`, height: note.height ? `${note.height / currentScale}px` : 'auto', transform: `scale(${currentScale})`, transformOrigin: 'top left', } : { width: '100%', height: '100%' };

  const renderContent = () => {
    switch (note.type) {
      case 'photo': return <div style={photoStyle} className="p-3 h-full flex flex-col"><div className="w-full flex-1 mb-2 overflow-hidden flex items-center justify-center min-h-0 rounded">{note.fileId ? <img src={note.fileId} alt="evidence" className="object-cover w-full h-full pointer-events-none" /> : <span className="text-gray-400 text-xs">No Image</span>}</div><p className="font-marker text-center text-gray-800 text-sm leading-tight break-words whitespace-pre-wrap flex-shrink-0">{note.content || "Untitled"}</p></div>;
      case 'evidence': return <div className="w-full h-full">{note.fileId && <img src={note.fileId} alt={note.content} className="w-full h-full object-contain pointer-events-none block" style={{ minHeight: '100px' }} />}</div>;
      case 'note': return <div style={noteStyle} className="px-4 py-2 min-h-[160px] h-full"><p className="font-handwriting text-blue-900 text-lg whitespace-pre-wrap pt-1">{note.content}</p></div>;
      case 'dossier': return <div className="relative pt-6 h-full flex flex-col"><div style={{ ...dossierTabStyle, zIndex: 1 }} className="absolute top-0 left-0 w-2/3 h-8 flex items-center"><span className="text-[10px] font-bold text-[#5c3a1e] px-4 uppercase tracking-wider mt-1">{note.title || "Top Secret"}</span></div><div style={{ ...dossierStyle, position: 'relative', zIndex: 2 }} className="p-4 min-h-[200px] flex flex-col h-full flex-1"><div className="border-b-2 border-[#d2b48c] mb-2 pb-1 flex items-center gap-2 flex-shrink-0"><FileText size={16} className="text-[#8b4513]" /><span className="font-bold text-[#8b4513] uppercase text-sm">{note.subtitle || "Case File"}</span></div><p className="font-mono text-xs text-gray-800 flex-1 whitespace-pre-wrap">{note.content}</p><div className="mt-2 self-end flex-shrink-0"><div className="w-20 h-6 border-2 border-red-800 rounded-full flex items-center justify-center opacity-70 transform -rotate-12"><span className="text-red-800 font-bold font-handwriting text-[11px] uppercase">Classified</span></div></div></div></div>;
      case 'scrap': return <div style={scrapStyle} className="p-4 min-h-[50px] h-full"><p className="font-mono text-sm text-gray-600 italic whitespace-pre-wrap">{note.content}</p></div>;
      case 'marker': return <div style={markerStyle} className="w-full h-full flex items-center justify-center"><span className="text-[#2b3a4a] leading-none text-center select-none" style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' }}>{note.content}</span></div>;
      default: return null;
    }
  };

  const CornerButton = ({ positionClass, onClick, icon: Icon, colorClass, title, cursorClass = "cursor-pointer", onMouseDown, style }: any) => (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} onMouseDown={(e) => { if (onMouseDown) onMouseDown(e); else if (e.button !== 1) e.stopPropagation(); }} onDoubleClick={(e) => e.stopPropagation()} className={`absolute w-8 h-8 rounded-full shadow-md flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95 z-[9999] ${positionClass || ''} ${colorClass} ${cursorClass}`} style={style} title={title}><Icon size={14} /></button>
  );

  return (
    <div ref={nodeRef} style={containerStyle} onMouseDown={(e) => onMouseDown(e, note.id)} onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(note.id); }} className={`group transition-transform duration-75 select-none pointer-events-auto ${isSelectedForConnection ? 'ring-4 ring-red-500 ring-offset-2' : ''}`}>
      {/* 虚线框：只要被选中就显示 */}
      {isSelected && (
        <div className="absolute -inset-4 pointer-events-none z-0">
          <svg className="w-full h-full overflow-visible"><rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#fbbf24" strokeWidth="3" strokeDasharray="10 6" className="animate-dash" rx="8" /></svg>
        </div>
      )}

      {/* 控制按钮：只有选中且【不是】多选状态时才显示 */}
      {isSelected && !isMultiSelected && (
        <>
          <CornerButton positionClass="-top-8 -left-8" onClick={onStartPin} icon={MapPin} colorClass="bg-yellow-600 hover:bg-yellow-500" title="Create Pin" />
          <CornerButton positionClass="-top-8 -right-8" onClick={onDelete} icon={Trash2} colorClass="bg-red-700 hover:bg-red-600" title="Destroy Evidence" />
          <CornerButton positionClass="-bottom-8 -left-8" onClick={() => { }} onMouseDown={(e: any) => onResizeStart(e, 'CORNER')} icon={Maximize} colorClass="bg-blue-600 hover:bg-blue-500" title="Scale" cursorClass="cursor-sw-resize" />
          <CornerButton onClick={() => { }} onMouseDown={(e: any) => onResizeStart(e, 'LEFT')} icon={MoveHorizontal} colorClass="bg-gray-700 hover:bg-gray-600 border border-gray-500" title="Resize Left" cursorClass="cursor-ew-resize" style={{ left: '-32px', top: '50%', transform: 'translateY(-50%)' }} />
          <CornerButton onClick={() => { }} onMouseDown={(e: any) => onResizeStart(e, 'RIGHT')} icon={MoveHorizontal} colorClass="bg-gray-700 hover:bg-gray-600 border border-gray-500" title="Resize Right" cursorClass="cursor-ew-resize" style={{ right: '-32px', top: '50%', transform: 'translateY(-50%)' }} />
          <CornerButton onClick={() => { }} onMouseDown={(e: any) => onResizeStart(e, 'TOP')} icon={MoveVertical} colorClass="bg-gray-700 hover:bg-gray-600 border border-gray-500" title="Resize Top" cursorClass="cursor-ns-resize" style={{ top: '-32px', left: '50%', transform: 'translateX(-50%)' }} />
          <CornerButton onClick={() => { }} onMouseDown={(e: any) => onResizeStart(e, 'BOTTOM')} icon={MoveVertical} colorClass="bg-gray-700 hover:bg-gray-600 border border-gray-500" title="Resize Bottom" cursorClass="cursor-ns-resize" style={{ left: '50%', bottom: '-32px', transform: 'translateX(-50%)' }} />
          <CornerButton positionClass="-bottom-8 -right-8" onClick={() => { }} onMouseDown={onRotateStart} icon={RotateCw} colorClass="bg-green-600 hover:bg-green-500" title="Rotate" cursorClass="cursor-ew-resize" />
        </>
      )}

      {!note.hasPin && note.type === 'note' && <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-16 h-8 bg-yellow-100 opacity-50 rotate-2 pointer-events-none"></div>}
      {!note.hasPin && note.type === 'photo' && <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-gray-400"><Paperclip size={24} /></div>}

      <div style={innerWrapperStyle}>{renderContent()}</div>
    </div>
  );
};

export default DetectiveNode;