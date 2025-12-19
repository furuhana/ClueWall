import { useState, useRef, useCallback } from 'react';

interface ViewState {
    x: number;
    y: number;
    zoom: number;
}

export const useCanvasView = () => {
    const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const toWorld = useCallback((screenX: number, screenY: number) => {
        return {
            x: (screenX - view.x) / view.zoom,
            y: (screenY - view.y) / view.zoom
        };
    }, [view]);

    const cancelAnimation = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    const handleZoomIn = useCallback(() => {
        setView(v => ({ ...v, zoom: Math.min(v.zoom + 0.2, 3) }));
    }, []);

    const handleZoomOut = useCallback(() => {
        setView(v => ({ ...v, zoom: Math.max(v.zoom - 0.2, 0.1) }));
    }, []);

    const handleResetView = useCallback(() => {
        const start = { ...view };
        const end = { x: 0, y: 0, zoom: 1 };
        if (start.x === 0 && start.y === 0 && start.zoom === 1) return;

        const startTime = performance.now();
        const duration = 1000;
        const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

        const animate = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = easeOutQuart(progress);
            const newX = start.x + (end.x - start.x) * ease;
            const newY = start.y + (end.y - start.y) * ease;
            const newZoom = start.zoom + (end.zoom - start.zoom) * ease;
            setView({ x: newX, y: newY, zoom: newZoom });
            if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
            else animationFrameRef.current = null;
        };
        cancelAnimation();
        animationFrameRef.current = requestAnimationFrame(animate);
    }, [view, cancelAnimation]);

    const handleWheel = useCallback((e: React.WheelEvent, ghostNote: any) => {
        // Ghost mode wheel handling should be outside or passed in, but for view specifically:
        if (ghostNote) return false; // Indicate not handled by view if ghost note exists

        cancelAnimation();
        const delta = -e.deltaY * 0.001;
        const newZoom = Math.min(Math.max(0.1, view.zoom + delta), 3.0);
        const worldMouse = toWorld(e.clientX, e.clientY);
        setView({ x: e.clientX - worldMouse.x * newZoom, y: e.clientY - worldMouse.y * newZoom, zoom: newZoom });
        return true; // Handled
    }, [view, toWorld, cancelAnimation]);

    const startPan = useCallback((clientX: number, clientY: number) => {
        setIsPanning(true);
        lastMousePosRef.current = { x: clientX, y: clientY };
        cancelAnimation();
    }, [cancelAnimation]);

    const updatePan = useCallback((clientX: number, clientY: number) => {
        if (isPanning && lastMousePosRef.current) {
            const dx = clientX - lastMousePosRef.current.x;
            const dy = clientY - lastMousePosRef.current.y;
            setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePosRef.current = { x: clientX, y: clientY };
        }
    }, [isPanning]);

    const stopPan = useCallback(() => {
        setIsPanning(false);
        lastMousePosRef.current = null;
    }, []);

    return {
        view,
        setView,
        isPanning,
        toWorld,
        handleZoomIn,
        handleZoomOut,
        handleResetView,
        handleWheel,
        startPan,
        updatePan,
        stopPan,
        cancelAnimation
    };
};
