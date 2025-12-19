import { useState, useEffect, useRef } from 'react';

export const useStealthMode = (
    handleResetInteractions: () => void
) => {
    const [isUIHidden, setIsUIHidden] = useState<boolean>(true); // Default to true as per original App.tsx
    const [showHiddenModeToast, setShowHiddenModeToast] = useState(false);
    const isUIHiddenRef = useRef(isUIHidden);

    useEffect(() => { isUIHiddenRef.current = isUIHidden; }, [isUIHidden]);

    // Toast Logic
    useEffect(() => {
        if (isUIHidden) {
            setShowHiddenModeToast(true);
            const timer = setTimeout(() => { setShowHiddenModeToast(false); }, 3000);
            return () => clearTimeout(timer);
        } else {
            setShowHiddenModeToast(false);
        }
    }, [isUIHidden]);

    // Initial Toast Delay
    useEffect(() => {
        const t = setTimeout(() => { if (isUIHiddenRef.current) setShowHiddenModeToast(true); }, 1000);
        return () => clearTimeout(t);
    }, []);

    // Global Key Handler for Stealth Mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Toggle UI with Ctrl+U
            if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
                e.preventDefault();
                setIsUIHidden(prev => !prev);
                return;
            }

            if (e.key === 'Escape') {
                if (isUIHidden) {
                    setIsUIHidden(false);
                } else {
                    handleResetInteractions();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isUIHidden, handleResetInteractions]);

    return {
        isUIHidden,
        setIsUIHidden,
        showHiddenModeToast
    };
};
