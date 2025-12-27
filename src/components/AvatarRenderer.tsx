import { useState, useEffect, useRef, useMemo } from 'react';
import type { EmgV2Data } from '../types/emg_v2';
import { VrmAvatarRenderer } from './VrmAvatarRenderer';

// Types for internal model data

// Helper for Auto-Trim
const getTrimmedBoundingBox = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;

    // Standard scan
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }
    return found ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
};

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

// VRM Data Interface
interface VrmData {
    type: 'VRM';
    name: string;
    vrmFile: string;
    meta?: any;
}

// Unified Data Type
type UnifiedAvatarData = AvatarData | EmgV2Data | VrmData;

interface AvatarRendererProps {
    avatarData: UnifiedAvatarData | null;
    isSpeaking: boolean;
    scale: number;
    position: { x: number; y: number };
    visible: boolean;
    onPositionChange?: (pos: { x: number; y: number }) => void;
    draggableWindow?: boolean;
    onImageLoaded?: (dimensions: { width: number; height: number }) => void;
    onActivity?: () => void;
    isThinking?: boolean;
    isSleeping?: boolean;
}

export const AvatarRenderer = ({
    avatarData,
    isSpeaking,
    scale,
    position,
    visible,
    draggableWindow,
    onImageLoaded,
    onActivity,
    isThinking,
    isSleeping,
    debugPattern,
    autoBlink = true,
    avatarId,
    onDragDelta,
    developerMode,
    controlsEnabled = false,
    vrmAmbientLightIntensity,
    vrmIdleAnimationPath,
    vrmHdriPath,
    vrmHdriIntensity
}: AvatarRendererProps & {
    developerMode?: boolean;
    debugPattern?: string | null;
    onActivity?: () => void;
    autoBlink?: boolean;
    avatarId?: string;
    onDragDelta?: (dx: number, dy: number) => void;
    controlsEnabled?: boolean;
    vrmAmbientLightIntensity?: number;
    vrmIdleAnimationPath?: string | null;
    vrmHdriPath?: string | null;
    vrmHdriIntensity?: number;
}) => {

    // State
    const [blinkState, setBlinkState] = useState<'open' | 'closed'>('open');
    const [currentPattern, setCurrentPattern] = useState<string>('idle.neutral');
    const [trim, setTrim] = useState<{ x: number, y: number } | null>(null); // Auto-Trim State

    // Pixel-Perfect Interaction Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const lastIgnoreStateRef = useRef<boolean>(false);
    const throttleRef = useRef<number>(0);

    // Drag refs
    const dragStart = useRef({ x: 0, y: 0 }); // Absolute screen start pos
    const dragOffset = useRef({ x: 0, y: 0 }); // Last screen pos
    const [isDragging, setIsDragging] = useState(false);
    const hasMoved = useRef(false);

    // Mouth Modulation State
    const [mouthOpenState, setMouthOpenState] = useState(false);
    const isSpeakingRef = useRef(isSpeaking);

    // Update ref
    useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

    // Blink Logic (standard)
    useEffect(() => {
        if (!visible || !avatarData || isThinking || isSleeping || !autoBlink) return;

        let timeoutId: NodeJS.Timeout;
        const blinkLoop = () => {
            // 30fps frames: ~3 seconds (90 frames)
            const minMs = 80 * 33.33; // ~2666ms
            const maxMs = 120 * 33.33; // ~4000ms
            const nextBlink = Math.random() * (maxMs - minMs) + minMs;

            timeoutId = setTimeout(() => {
                // Determine single or double blink
                const isDouble = Math.random() < 0.2; // 20% chance

                const performBlink = () => {
                    setBlinkState('closed');
                    setTimeout(() => {
                        setBlinkState('open');

                        if (isDouble) {
                            setTimeout(() => {
                                setBlinkState('closed');
                                setTimeout(() => {
                                    setBlinkState('open');
                                    blinkLoop();
                                }, 100);
                            }, 100); // Short interval between blinks
                        } else {
                            blinkLoop();
                        }
                    }, 150); // Blink duration
                };

                performBlink();
            }, nextBlink);
        };
        blinkLoop();
        return () => clearTimeout(timeoutId);
    }, [visible, avatarData, isThinking, isSleeping, autoBlink]);

    // Speech Modulation & Random Expressions
    useEffect(() => {
        if (!isSpeaking) {
            setMouthOpenState(false);
            if (!isThinking) setCurrentPattern('idle.neutral'); // Reset to neutral if just stopped
            return;
        }

        const interval = setInterval(() => {
            // Modulate mouth state (simulate clauses/syllables)
            // Randomly close for short periods
            if (Math.random() > 0.7) {
                setMouthOpenState(false);
            } else {
                setMouthOpenState(true);
            }

            // Randomly change expression (rarely)
            if (Math.random() > 0.95) {
                // Pick random key from mapping that starts with 'idle.'
                if (avatarData && 'mapping' in avatarData) {
                    const keys = Object.keys(avatarData.mapping).filter(k => k.startsWith('idle.'));
                    if (keys.length > 0) {
                        const randomKey = keys[Math.floor(Math.random() * keys.length)];
                        setCurrentPattern(randomKey);
                    }
                }
            } else if (Math.random() > 0.95) {
                // Reset to neutral occasionally
                setCurrentPattern('idle.neutral');
            }

        }, 120); // Check every 120ms or so

        return () => clearInterval(interval);
    }, [isSpeaking, avatarData, isThinking]);

    // Drag Logic - Global Screen Coordinates
    const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
    const handleMouseUpRef = useRef<((e: MouseEvent) => void) | null>(null);


    // --- HIT TESTING LOGIC ---
    const updateHitTest = (e: React.MouseEvent | MouseEvent) => {
        // Debounce/Throttle
        const now = Date.now();
        if (now - throttleRef.current < 50) return; // 20fps check
        throttleRef.current = now;

        if (!canvasRef.current || !contextRef.current || !visible) return;

        // Get mouse position relative to image
        // Assuming image fills container
        const rect = (e.target as Element).closest('div')?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Map to canvas coordinates
        // Canvas should match natural size, so we scale?
        // Or we draw to canvas at displayed size?
        // Better: Draw at generic small size or match display?
        // If canvas matches NATURAL size, we need to map display coords to natural.
        // Let's assume we map simply:

        // Actually, easiest way: 
        // 1. Get pixel from canvas (which contains the current image frame)
        // We need to ensure canvas has the image drawn!

        try {
            const ctx = contextRef.current;
            // Coordinate mapping (Display -> Natural)
            // rect.width is displayed width
            // canvas.width is natural width
            const scaleX = canvasRef.current.width / rect.width;
            const scaleY = canvasRef.current.height / rect.height;

            const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
            const alpha = pixel[3];

            // Transparency Threshold (e.g., 10/255)
            const isTransparent = alpha < 10;

            // IPC Call only on change
            if (isTransparent !== lastIgnoreStateRef.current) {
                // console.log(`Alpha: ${alpha}, Ignore: ${isTransparent}`);
                if (window.electronAPI.setIgnoreMouseEvents) {
                    window.electronAPI.setIgnoreMouseEvents(isTransparent, { forward: true });
                }
                lastIgnoreStateRef.current = isTransparent;
            }
        } catch (err) {
            // Context lost or sizing error
        }
    };


    // Cleanup helper
    const cleanupDragListeners = () => {
        if (handleMouseMoveRef.current) window.removeEventListener('mousemove', handleMouseMoveRef.current);
        if (handleMouseUpRef.current) window.removeEventListener('mouseup', handleMouseUpRef.current);
        // Clean refs
        handleMouseMoveRef.current = null;
        handleMouseUpRef.current = null;
        // State update
        setIsDragging(false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Handle Right Click for Context Menu directly (Button 2)
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            if (avatarId && window.electronAPI.showCostumeMenu) {
                // Pass current active binds
                window.electronAPI.showCostumeMenu(avatarId, activeBinds);
            }
            return;
        }

        // Signal activity
        if (onActivity) onActivity();

        if (draggableWindow) return; // Window handles drag logic natively, or strict mode.
        if (developerMode && controlsEnabled) return; // Camera control mode: Disable window drag


        if ((e.target as HTMLElement).closest('.debug-ui')) return;

        if (e.button !== 0) return; // Left click only

        e.preventDefault(); // Prevent text selection

        if (window.electronAPI.log) window.electronAPI.log(`[AvatarRenderer] Drag MouseDown ${e.screenX} ${e.screenY}`);

        // init drag state
        dragStart.current = { x: e.screenX, y: e.screenY };
        dragOffset.current = { x: e.screenX, y: e.screenY };
        hasMoved.current = false;

        // Define listeners for this drag session
        const onMove = (mv: MouseEvent) => {
            // Check if buttons released (lost focus case)
            if (mv.buttons !== 1) {
                cleanupDragListeners();
                return;
            }

            const currentX = mv.screenX;
            const currentY = mv.screenY;
            console.log('[AvatarRenderer] Move Event', currentX, currentY);

            // Force drag (No threshold for debug)
            if (!isDragging) {
                setIsDragging(true);
                hasMoved.current = true;
            }

            const dx = currentX - dragOffset.current.x;
            const dy = currentY - dragOffset.current.y;

            if (dx !== 0 || dy !== 0) {
                if (window.electronAPI.log) window.electronAPI.log(`[AvatarRenderer] Drag Delta ${dx} ${dy}`);
                if (onDragDelta) onDragDelta(dx, dy);
                dragOffset.current = { x: currentX, y: currentY };
                hasMoved.current = true;
            }
        };

        const onUp = () => {
            if (window.electronAPI.log) window.electronAPI.log('[AvatarRenderer] Drag End');
            cleanupDragListeners();
        };

        handleMouseMoveRef.current = onMove;
        handleMouseUpRef.current = onUp;

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const handleClick = () => {
        if (hasMoved.current) {
            hasMoved.current = false;
            return;
        }
        // Click Feedback
        if (onActivity) onActivity();
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (avatarId && window.electronAPI.syncAvatarScale) {
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newScale = Math.max(0.1, Math.min(5.0, scale + delta));
            window.electronAPI.syncAvatarScale(newScale);
        }
    };

    // Costume & Reload State
    const [imageVersion, setImageVersion] = useState(0);
    const [activeBinds, setActiveBinds] = useState<number[]>([]);
    const [debugCostumes, setDebugCostumes] = useState<{ id: number; name: string; default: boolean }[]>([]);

    useEffect(() => {
        if (developerMode && avatarId && window.electronAPI.getUkagakaCostumes) {
            window.electronAPI.getUkagakaCostumes(avatarId).then((list) => {
                if (Array.isArray(list)) setDebugCostumes(list);
            }).catch(err => console.error("Failed to load debug costumes", err));
        }
    }, [developerMode, avatarId]);

    useEffect(() => {
        if (!avatarId) return;
        const loadBinds = async () => {
            const storageKey = `ukagaka_binds_${avatarId}`;
            const stored = localStorage.getItem(storageKey);
            // Wait, we need to respect SERVER state if provided? 
            // For now, LocalStorage is the persistent store for this client.
            if (stored) {
                try {
                    setActiveBinds(JSON.parse(stored));
                    return;
                } catch (e) { console.error(e); }
            }
            try {
                const costumes = await window.electronAPI.getUkagakaCostumes(avatarId);
                const defaults = costumes.filter((c: any) => c.default).map((c: any) => c.id);
                setActiveBinds(defaults);
            } catch (e) { console.error(e); }
        };
        loadBinds();
    }, [avatarId]);

    // Listeners for Costume Changes
    useEffect(() => {
        if (!window.electronAPI) return;
        const removeCostumeListener = window.electronAPI.onCostumeChanged((newBinds) => {
            setActiveBinds(newBinds);
            if (avatarId) {
                localStorage.setItem(`ukagaka_binds_${avatarId}`, JSON.stringify(newBinds));
            }
        });
        const removeReloadListener = window.electronAPI.onReloadAvatarImage(() => {
            setImageVersion(v => v + 1);
        });
        return () => {
            removeCostumeListener();
            removeReloadListener();
        };
    }, [avatarId]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (avatarId && window.electronAPI.showCostumeMenu) {
            window.electronAPI.showCostumeMenu(avatarId, activeBinds);
        }
    };

    if (!visible || !avatarData) return null;

    // Resolve Image
    let displayPattern = debugPattern || currentPattern;
    const isV1 = 'mapping' in avatarData;
    const isVRM = 'type' in avatarData && (avatarData as any).type === 'VRM';

    if (isV1) {
        const v1Data = avatarData as AvatarData;
        if (!debugPattern && isThinking && !isSpeaking) {
            const thinkingKeys = Object.keys(v1Data.mapping).filter(k => k.includes('think'));
            if (thinkingKeys.length > 0) displayPattern = thinkingKeys[0];
            else displayPattern = 'idle.neutral';
        } else if (!debugPattern && isSleeping && !isSpeaking) {
            const sleepKeys = Object.keys(v1Data.mapping).filter(k => k.includes('sleep'));
            if (sleepKeys.length > 0) displayPattern = sleepKeys[0];
        }
    }

    // Logic for V1 Image Resolution (moved to temporary var)
    // Only execute if V1
    const v1Mapping = isV1 ? ((avatarData as AvatarData).mapping[displayPattern] || Object.values((avatarData as AvatarData).mapping)[0]) : null;

    // Logic for V1 Image Resolution
    let imageUrl: string | null = null;

    if (isV1) {
        const mapping = v1Mapping;
        if (mapping) {
            const getPath = (key: string) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const assetPath = (mapping as any)[key];
                if (!assetPath) return null;
                const id = avatarId || 'current';
                return `avatar://${id}/${assetPath}?v=${imageVersion}`;
            };

            imageUrl = getPath('base');
            // If base is empty, fallback
            if (!imageUrl) {
                // Try other keys
                const keys = ['mouthClosed', 'mouthOpen', 'eyesClosed', 'mouthOpenEyesClosed'] as const;
                for (const k of keys) {
                    const p = getPath(k);
                    if (p) { imageUrl = p; break; }
                }
            }

            const effectiveBlinkState = (isThinking && !isSpeaking) || (isSleeping && !isSpeaking) ? 'closed' : blinkState;
            const effectiveMouthOpen = isSpeaking ? (mouthOpenState) : false;

            if (effectiveMouthOpen) {
                if (effectiveBlinkState === 'closed') {
                    imageUrl = getPath('mouthOpenEyesClosed') || getPath('mouthOpen') || imageUrl;
                } else {
                    imageUrl = getPath('mouthOpen') || imageUrl;
                }
            } else {
                if (effectiveBlinkState === 'closed') {
                    imageUrl = getPath('eyesClosed') || imageUrl;
                } else {
                    imageUrl = getPath('mouthClosed') || imageUrl;
                }
            }
        }
    }

    const containerStyle: React.CSSProperties = draggableWindow ? {
        position: 'relative',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        cursor: 'default',
    } as any : {
        position: 'fixed',
        left: position.x,
        top: position.y,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        cursor: isDragging ? 'grabbing' : 'grab',
    } as any;

    return (
        <div
            className={`z-0 pointer-events-auto select-none no-drag ${!draggableWindow ? 'fixed' : ''}`}
            style={containerStyle}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onMouseMove={updateHitTest}
        >
            {/* Hidden Canvas for Hit Testing */}
            <canvas ref={canvasRef} className="hidden" />

            {isVRM && avatarId && (
                <div
                    style={{
                        width: '600px',
                        height: '800px',
                        WebkitAppRegion: controlsEnabled ? 'no-drag' : undefined,
                        background: controlsEnabled ? 'rgba(0,0,0,0.01)' : 'transparent', // Fix for Electron click-through
                    } as any}
                > {/* Container for Canvas */}
                    <VrmAvatarRenderer
                        avatarUrl={`avatar://${avatarId}/${(avatarData as VrmData).vrmFile}`}
                        isSpeaking={isSpeaking}
                        scale={scale}
                        controlsEnabled={controlsEnabled}
                        ambientLightIntensity={vrmAmbientLightIntensity}
                        idleAnimationPath={vrmIdleAnimationPath}
                        vrmHdriPath={vrmHdriPath}
                        vrmHdriIntensity={vrmHdriIntensity}
                        onLoaded={() => {
                            if (onImageLoaded) {
                                // Default Window Size for VRM (TODO: Save per avatar)
                                onImageLoaded({ width: 600, height: 800 });
                            }
                        }}
                    />
                </div>
            )}

            {isV1 && imageUrl && (
                <img
                    src={imageUrl}
                    alt="Avatar"
                    draggable={false} // Prevent native drag
                    className="pointer-events-auto select-none"
                    style={{
                        position: 'absolute',
                        left: trim ? -trim.x : 0,
                        top: trim ? -trim.y : 0,
                        maxWidth: 'none',
                        maxHeight: 'none',
                        filter: isSleeping ? 'grayscale(0.5) brightness(0.8)' : 'none',
                        transition: 'filter 0.5s ease',
                    }}
                    onLoad={(e) => {
                        // Update Canvas for Hit Testing && Trim Detection
                        const canvas = canvasRef.current;
                        if (canvas) {
                            canvas.width = e.currentTarget.naturalWidth;
                            canvas.height = e.currentTarget.naturalHeight;
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            if (ctx) {
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(e.currentTarget, 0, 0);
                                contextRef.current = ctx;

                                // Detect Trim
                                const bbox = getTrimmedBoundingBox(ctx, canvas.width, canvas.height);
                                if (bbox) {
                                    setTrim({ x: bbox.x, y: bbox.y });
                                    if (onImageLoaded) {
                                        onImageLoaded({ width: bbox.width, height: bbox.height });
                                    }
                                } else {
                                    setTrim(null);
                                    if (onImageLoaded) {
                                        onImageLoaded({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
                                    }
                                }
                            }
                        }
                    }}
                />
            )}

            {/* V2 Rendering */}
            {!isV1 && !isVRM && (
                <EmgV2Renderer
                    data={avatarData as EmgV2Data}
                    canvasRef={canvasRef}
                    contextRef={contextRef}
                    onImageLoaded={onImageLoaded}
                    isSpeaking={isSpeaking}
                    avatarId={avatarId}
                    version={imageVersion}
                />
            )}
            {/* Developer Mode Overlay */}
            {developerMode && debugCostumes.length > 0 && (
                <div
                    className="absolute bottom-0 left-0 bg-black/80 text-white text-xs p-2 rounded max-h-40 overflow-y-auto z-50 pointer-events-auto w-48 no-drag"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <p className="font-bold border-b border-white/20 mb-1">Costumes (Dev)</p>
                    <div className="flex gap-2 mb-2">
                        <button
                            className="bg-blue-600 px-2 py-1 rounded"
                            onClick={() => window.electronAPI.moveAvatarWindow && window.electronAPI.moveAvatarWindow(10, 10)}
                        >
                            Test Move (+10)
                        </button>
                    </div>
                    <ul className="space-y-1">
                        {debugCostumes.map(c => (
                            <li key={c.id} className="flex gap-2 items-center hover:bg-white/10 p-1 cursor-pointer">
                                <span className={activeBinds.includes(c.id) ? 'text-green-400' : 'text-gray-400'}>
                                    {activeBinds.includes(c.id) ? '[x]' : '[ ]'}
                                </span>
                                <span className="truncate">{c.name}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// --- Sub-Component for V2 Rendering ---
const EmgV2Renderer = ({
    data,
    canvasRef,
    contextRef,
    onImageLoaded,
    isSpeaking,
    avatarId,
    version
}: {
    data: EmgV2Data,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    contextRef: React.MutableRefObject<CanvasRenderingContext2D | null>,
    onImageLoaded?: (dim: { width: number, height: number }) => void,
    isSpeaking: boolean,
    avatarId?: string,
    version?: number
}) => {
    // Determine canvas size from data
    const width = data.baseCanvasWidth || 500;
    const height = data.baseCanvasHeight || 500;
    const [, setAnimationFrame] = useState(0);

    // Initial Load & Dimensions
    useEffect(() => {
        if (onImageLoaded) onImageLoaded({ width, height });

        // Setup Canvas
        if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
            if (ctx) contextRef.current = ctx;
        }
    }, [width, height, onImageLoaded]);

    // Sort Layers
    const sortedLayers = useMemo(() => {
        // If not speaking, filter out 'mouth' related layers? 
        // V2 doesn't specify mouth layers explicitly.
        // We'll keep all layers but maybe pause animation on mouth if !isSpeaking?
        // For now, simple sort.
        return [...data.layers].sort((a, b) => (a.textureZIndex || 0) - (b.textureZIndex || 0));
    }, [data.layers, isSpeaking]); // Added isSpeaking dependency if we use it later

    // Animation Tick
    useEffect(() => {
        let frame = 0;
        const interval = setInterval(() => {
            frame++;
            setAnimationFrame(frame); // Trigger generic refresh
        }, 1000 / 30); // 30fps
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {sortedLayers.map((layer, idx) => {
                let src = "";
                const id = avatarId || 'current';

                if (layer.imgType === "Sprite" && layer.sprites && layer.sprites.useTex) {
                    const count = layer.sprites.useTex.length;
                    const fps = layer.sprites.fps || 30;
                    // Approximated index based on global time
                    const index = Math.floor((Date.now() / (1000 / fps))) % count;
                    const tex = layer.sprites.useTex[index % count];
                    src = `avatar://${id}/${tex}?v=${version || 0}`;
                } else {
                    // Texture
                    src = `avatar://${id}/${layer.textureID}.png?v=${version || 0}`;
                }

                return (
                    <img
                        key={layer.textureID + idx}
                        src={src}
                        className="absolute pointer-events-auto"
                        style={{
                            left: `${(layer.x / width) * 100}%`,
                            top: `${(layer.y / height) * 100}%`,
                            width: `${(layer.width / width) * 100}%`,
                            height: `${(layer.height / height) * 100}%`,
                            zIndex: layer.textureZIndex
                        }}
                        draggable={false}
                    />
                );
            })}
        </div>
    );
};
