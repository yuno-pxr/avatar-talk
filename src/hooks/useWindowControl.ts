import { useState, useEffect } from 'react';

interface UseWindowControlProps {
    isAvatarMode: boolean;
    avatarVisible: boolean;
    currentAvatarId: string | null;
    developerMode: boolean; // Kept in interface to satisfy call site, but unused locally
    onShowCostumeMenu?: (avatarId: string, cameraMode: boolean) => void;
}

export const useWindowControl = ({
    isAvatarMode,
    avatarVisible,
    currentAvatarId,
    // developerMode, // Unused in logic
    onShowCostumeMenu
}: UseWindowControlProps) => {
    const [cameraControlMode, setCameraControlMode] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Escape to Exit Camera Control
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && cameraControlMode) {
                setCameraControlMode(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cameraControlMode]);

    // Window Drag and Context Menu Logic
    useEffect(() => {
        if (isAvatarMode && avatarVisible) {
            let dragging = false;

            const handleMouseDown = (e: MouseEvent) => {
                // Right Click: Context Menu or Camera Pan
                if (e.button === 2) {
                    // If Camera Control is ON, allow propagation so OrbitControls can PAN
                    if (cameraControlMode) {
                        return; // Allow OrbitControls
                    }

                    // Otherwise, block and show Context Menu
                    e.preventDefault();
                    e.stopPropagation();

                    if (currentAvatarId && onShowCostumeMenu) {
                        onShowCostumeMenu(currentAvatarId, cameraControlMode);
                    }
                    return;
                }

                // Left Click: Start Drag
                // Fires only on background/canvas because interactive elements stop propagation
                if (e.button === 0) {
                    dragging = true;
                    setIsDragging(true);
                }
            };

            const handleMouseMove = (e: MouseEvent) => {
                if (dragging) {
                    // Use movementX/Y scaled by devicePixelRatio for 1:1 movement
                    const dpr = window.devicePixelRatio || 1;
                    const dx = e.movementX / dpr;
                    const dy = e.movementY / dpr;

                    if (window.electronAPI.moveAvatarWindow && (dx !== 0 || dy !== 0)) {
                        window.electronAPI.moveAvatarWindow(dx, dy);
                    }
                }
            };

            const handleMouseUp = () => {
                dragging = false;
                setIsDragging(false);
            };

            const handleContextMenu = (e: MouseEvent) => {
                // Block OS Context Menu in Camera Mode (so we can Pan with Right Click)
                // In non-camera mode, we already handled 'mousedown' right click, 
                // but purely blocking 'contextmenu' event is safe double-check.
                if (cameraControlMode) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };

            window.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('contextmenu', handleContextMenu);

            return () => {
                window.removeEventListener('mousedown', handleMouseDown);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('contextmenu', handleContextMenu);
            };
        }
    }, [isAvatarMode, avatarVisible, currentAvatarId, cameraControlMode, onShowCostumeMenu]);

    return {
        cameraControlMode,
        setCameraControlMode,
        isDragging
    };
};
