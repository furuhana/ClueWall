import { useState, useRef, useEffect, useCallback } from 'react';

export const useAudio = () => {
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.1; // 10% volume
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.then(() => setIsMusicPlaying(true))
                    .catch(error => {
                        console.log("Auto-play blocked by browser policy");
                        setIsMusicPlaying(false);
                        const enableAudio = () => {
                            if (audioRef.current) {
                                audioRef.current.play();
                                setIsMusicPlaying(true);
                                window.removeEventListener('click', enableAudio);
                                window.removeEventListener('keydown', enableAudio);
                            }
                        };
                        window.addEventListener('click', enableAudio);
                        window.addEventListener('keydown', enableAudio);
                    });
            }
        }
    }, []);

    const toggleMusic = useCallback(() => {
        if (!audioRef.current) return;
        if (isMusicPlaying) {
            audioRef.current.pause();
            setIsMusicPlaying(false);
        } else {
            audioRef.current.play().then(() => setIsMusicPlaying(true));
        }
    }, [isMusicPlaying]);

    return {
        audioRef,
        isMusicPlaying,
        toggleMusic
    };
};
