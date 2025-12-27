import { useState, useCallback } from 'react';

// Types (You might want to extract these to a shared types file later)
import type { EmgV2Data } from '../types/emg_v2';

// Temporary interface re-definitions (Should be imported from a central type definition)
interface AvatarLayerMap {
    base?: string;
    mouthOpen?: string;
    mouthClosed?: string;
    eyesClosed?: string;
    mouthOpenEyesClosed?: string;
    isSleep?: boolean;
}

interface AvatarData {
    assetsRoot: string;
    mapping: Record<string, AvatarLayerMap>;
    width?: number;
    height?: number;
    anchorY?: number;
}

interface VrmData {
    type: 'VRM';
    name: string;
    vrmFile: string;
    meta?: any;
}

type UnifiedAvatarData = AvatarData | EmgV2Data | VrmData;

interface UseAvatarProps {
    onLoadComplete?: (id: string) => void;
}

export const useAvatar = ({ onLoadComplete }: UseAvatarProps = {}) => {
    const [currentAvatarId, setCurrentAvatarId] = useState<string | null>(null);
    const [avatarData, setAvatarData] = useState<UnifiedAvatarData | null>(null);
    const [isAvatarMode, setIsAvatarMode] = useState(false);
    const [avatarVisible, setAvatarVisible] = useState(true); // Default true?
    const [avatarScale, setAvatarScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(false);

    // Initial Load Logic (moved from App.tsx useEffect)
    const loadDefaultAvatar = useCallback(async () => {
        // Logic to load default if needed
        // For now, checks installed avatars
        try {
            if (window.electronAPI.getInstalledAvatars) {
                const list = await window.electronAPI.getInstalledAvatars();
                if (list.length > 0) {
                    await switchInstalledAvatar(list[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to load default avatar", e);
        }
    }, []);

    const switchInstalledAvatar = useCallback(async (avatarId: string) => {
        try {
            setIsLoading(true);
            const result = await window.electronAPI.loadInstalledAvatar(avatarId);
            if (result && result.modelData) {
                setAvatarData(result.modelData);
                setCurrentAvatarId(result.avatarId);

                // Auto-Switch to Avatar Mode if loaded
                setIsAvatarMode(true);
                setAvatarVisible(true);

                if (onLoadComplete) onLoadComplete(result.avatarId);
            }
        } catch (error) {
            console.error("Failed to switch avatar:", error);
        } finally {
            setIsLoading(false);
        }
    }, [onLoadComplete]);

    const loadAvatar = useCallback(async (path: string) => {
        try {
            setIsLoading(true);
            const data = await window.electronAPI.loadAvatar(path);
            if (data) {
                setAvatarData(data);
                // Assume path hashing or similar provided ID, but for raw load might needed
                // For now, loadAvatar generally returns data. 
                // We might need to handle ID assignment if loading from file directly.
                // But App.tsx used `loadAvatar` mainly for DragDrop?

                setIsAvatarMode(true);
                setAvatarVisible(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const toggleAvatarMode = useCallback(() => {
        setIsAvatarMode(prev => !prev);
    }, []);

    return {
        currentAvatarId,
        avatarData,
        isAvatarMode,
        setIsAvatarMode,
        avatarVisible,
        setAvatarVisible,
        avatarScale,
        setAvatarScale,
        isLoading,
        switchInstalledAvatar,
        loadAvatar,
        toggleAvatarMode,
        loadDefaultAvatar
    };
};
