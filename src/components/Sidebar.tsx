import React, { useState } from 'react';
import { Board } from '../types';
import {
    StickyNote, Image as ImageIcon, Folder, FileText, MapPin, Trash2,
    PlusSquare, Settings, Edit3, Globe, ChevronRight, Archive, Shield, LogOut
} from 'lucide-react';

interface SidebarProps {
    // Tools
    onAddNote: (type: 'note' | 'photo' | 'dossier' | 'scrap' | 'marker') => void;
    onClearBoard: () => void;
    isPinMode: boolean;
    onTogglePinMode: () => void;

    // Boards / Worlds
    boards: Board[];
    activeBoardId: number | null;
    onSelectBoard: (id: number) => void;
    onAddBoard: () => void;
    onRenameBoard: (id: number, newName: string) => void;
    onDeleteBoard: (id: number) => void;
    onOpenSettings: (board: Board) => void;
    onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    onAddNote, onClearBoard, isPinMode, onTogglePinMode,
    boards, activeBoardId, onSelectBoard, onAddBoard, onRenameBoard, onDeleteBoard,
    onOpenSettings, onSignOut
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="bg-black/80 backdrop-blur text-white p-4 rounded-lg shadow-float border border-white/10 w-64 transition-all duration-300 pointer-events-auto">

            {/* 1. Tools Section */}
            <div className="mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Shield size={12} /> Detective Tools
                </h3>

                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => onAddNote('note')} className="px-2 py-2 bg-yellow-600/80 hover:bg-yellow-500 rounded text-xs flex items-center gap-2 transition-colors">
                        <StickyNote size={14} /> Note
                    </button>
                    <button onClick={() => onAddNote('photo')} className="px-2 py-2 bg-gray-700/80 hover:bg-gray-600 rounded text-xs flex items-center gap-2 transition-colors">
                        <ImageIcon size={14} /> Photo
                    </button>
                    <button onClick={() => onAddNote('dossier')} className="px-2 py-2 bg-orange-800/80 hover:bg-orange-700 rounded text-xs flex items-center gap-2 transition-colors">
                        <Folder size={14} /> Dossier
                    </button>
                    <button onClick={() => onAddNote('scrap')} className="px-2 py-2 bg-stone-300/80 hover:bg-stone-200 text-stone-900 rounded text-xs flex items-center gap-2 transition-colors">
                        <FileText size={14} /> Scrap
                    </button>

                    <button onClick={() => onAddNote('marker')} className="col-span-2 px-3 py-2 bg-[#ABBDD7] hover:bg-[#9aacd0] text-blue-900 font-bold rounded text-xs flex items-center justify-center gap-2 transition-colors">
                        <MapPin size={14} /> Add Location Marker
                    </button>
                </div>

                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onTogglePinMode}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${isPinMode ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                    >
                        <MapPin size={14} /> {isPinMode ? 'PINNING...' : 'PIN MODE'}
                    </button>
                    <button
                        onClick={onClearBoard}
                        className="px-3 py-2 border border-red-900/50 text-red-500 hover:bg-red-900/20 rounded text-xs transition-colors"
                        title="Clear Board"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* 2. Divider */}
            <div className="border-t border-white/10 my-4"></div>

            {/* 3. World Selector */}
            <div>
                <div
                    className="flex items-center justify-between mb-2 cursor-pointer hover:text-white text-gray-400 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Globe size={12} /> 选择世界 (Worlds)
                    </h3>
                    <ChevronRight size={14} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>

                {isExpanded && (
                    <div className="max-h-60 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                        {boards.map(board => (
                            <div
                                key={board.id}
                                className={`group flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-all ${board.id === activeBoardId
                                    ? 'bg-red-900/40 text-red-100 border-l-2 border-red-500'
                                    : 'hover:bg-white/5 text-gray-400 border-l-2 border-transparent'
                                    }`}
                                onClick={() => onSelectBoard(board.id)}
                            >
                                <span className="truncate max-w-[120px] font-mono">{board.name}</span>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        className="p-1 hover:text-white text-gray-500 transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenSettings(board);
                                        }}
                                        title="Configure"
                                    >
                                        <Settings size={12} />
                                    </button>
                                    <button
                                        className="p-1 hover:text-blue-400 text-gray-500 transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newName = prompt("Rename World:", board.name);
                                            if (newName) onRenameBoard(board.id, newName);
                                        }}
                                        title="Rename"
                                    >
                                        <Edit3 size={12} />
                                    </button>
                                    {boards.length > 1 && (
                                        <button
                                            className="p-1 hover:text-red-500 text-gray-500 transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteBoard(board.id);
                                            }}
                                            title="Destroy World"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        <button
                            onClick={onAddBoard}
                            className="w-full mt-2 flex items-center justify-center gap-2 py-2 border border-dashed border-gray-700/50 rounded text-xs text-gray-500 hover:text-green-400 hover:border-green-900/50 transition-all hover:bg-green-900/10"
                        >
                            <PlusSquare size={12} /> Create New World
                        </button>
                    </div>
                )}
                <div className="p-4 border-t border-white/10 mt-auto">
                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/30 rounded transition-all text-xs font-bold uppercase tracking-wider"
                    >
                        <LogOut size={14} /> Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
};
