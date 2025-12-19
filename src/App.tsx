import React from 'react';
// 1. 导入自定义 Hooks
import { useCanvasView } from './hooks/useCanvasView';
import { useBoardData } from './hooks/useBoardData';
import { useInteractions } from './hooks/useInteractions';
import { useAudio } from './hooks/useAudio';
import { useStealthMode } from './hooks/useStealthMode';

// 2. 导入 UI 组件
import DetectiveNode from './components/DetectiveNode';
import ConnectionLayer from './components/ConnectionLayer';
// ... 各种图标导入

const App: React.FC = () => {
    // --- A. 调用 Hooks 获取状态和方法 ---
    const { view, setView, handleZoomIn, handleZoomOut, toWorld } = useCanvasView();
    const { notes, connections, activeBoardId, isLoading, saveToCloud } = useBoardData();
    const { isMusicPlaying, toggleMusic, audioRef } = useAudio("/home_bgm.mp3");
    const { isUIHidden, showHiddenModeToast } = useStealthMode();

    // --- B. 核心交互逻辑（通过 Hook 组合） ---
    // 我们会把最复杂的 MouseMove 等逻辑塞进这个 Hook
    const interaction = useInteractions({ notes, view, toWorld, saveToCloud });

    // --- C. 渲染界面 (JSX) ---
    return (
        <div
            className="board-container"
            onWheel={interaction.handleWheel}
            onMouseDown={interaction.handleBackgroundMouseDown}
        // ... 其他全局事件
        >
            <audio ref={audioRef} src="/home_bgm.mp3" loop />

            {/* 只有在 UI 没隐藏时才显示工具栏 */}
            {!isUIHidden && <Toolbar onZoomIn={handleZoomIn} onAddNote={interaction.addNote} />}

            {/* 画布核心层：只负责循环渲染组件 */}
            <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
                {notes.map(note => (
                    <DetectiveNode
                        key={note.id}
                        note={note}
                        {...interaction.getNodeProps(note.id)} // 自动注入所有拖拽、缩放的方法
                    />
                ))}
                <ConnectionLayer connections={connections} />
            </div>

            {/* 遮罩和提示 UI */}
            {isLoading && <LoadingOverlay />}
            {showHiddenModeToast && <Toast message="PRESS ESC TO REVEAL UI" />}
        </div>
    );
};