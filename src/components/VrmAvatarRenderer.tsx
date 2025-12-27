import React, { useState, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
// @ts-ignore
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as THREE from 'three';

interface InternalVRMModelProps {
    url: string;
    isSpeaking: boolean;
    setIsLoading?: (loading: boolean) => void;
    idleAnimationPath?: string | null;
}

const VRMModel = ({ url, isSpeaking, setIsLoading, idleAnimationPath }: InternalVRMModelProps) => {
    const gltf = useLoader(GLTFLoader, url, (loader) => {
        loader.register((parser: any) => new VRMLoaderPlugin(parser));
    });

    const [vrm, setVrm] = useState<any>(null);

    useEffect(() => {
        if (gltf.userData.vrm) {
            const v = gltf.userData.vrm;
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);
            v.scene.rotation.y = Math.PI; // Face forward
            setVrm(v);
            if (setIsLoading) setIsLoading(false);
        }
    }, [gltf, setIsLoading]);

    useFrame((state, delta) => {
        if (vrm) {
            if (mixer) {
                mixer.update(delta);
            } else if (vrm.humanoid) {
                // Procedural Breathing (Default Idle)
                const t = state.clock.elapsedTime;
                const s = Math.sin(t * 1.5); // Breathing speed

                // Relax Arms (from T-Pose)
                const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
                const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
                const spine = vrm.humanoid.getNormalizedBoneNode('spine');
                const chest = vrm.humanoid.getNormalizedBoneNode('chest'); // or upperChest

                if (leftArm) leftArm.rotation.z = Math.PI / 2.5 + s * 0.05; // ~72 deg down
                if (rightArm) rightArm.rotation.z = -Math.PI / 2.5 - s * 0.05;

                // Breathing Motion (Chest/Spine)
                if (spine) spine.rotation.x = s * 0.03;
                if (chest) chest.rotation.x = s * 0.03;
            }

            if (vrm.expressionManager) {
                // Auto Blink (Simple) - Disable if animation handles it? Usually mixamo doesn't.
                // Keep blink logic for now unless conflict.
                const blinkValue = Math.sin(state.clock.elapsedTime * 2) > 0.9 ? 1 : 0;
                vrm.expressionManager.setValue('blink', blinkValue);

                // Lip Sync (Simple Volume based or explicit prop)
                if (isSpeaking) {
                    const mouthOpen = Math.sin(state.clock.elapsedTime * 20) * 0.5 + 0.5;
                    vrm.expressionManager.setValue('aa', mouthOpen);
                } else {
                    vrm.expressionManager.setValue('aa', 0);
                }
                vrm.expressionManager.update();
            }
            vrm.update(delta);
        }
    });

    const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);

    // Load Idle Animation
    useEffect(() => {
        if (!vrm || !idleAnimationPath) return;

        const loadAnim = async () => {
            try {
                // Determine loader based on extension
                const isFbx = idleAnimationPath.toLowerCase().endsWith('.fbx');
                const isVrma = idleAnimationPath.toLowerCase().endsWith('.vrma');

                let clip: THREE.AnimationClip | null = null;

                if (isFbx) {
                    const loader = new FBXLoader();
                    const object = await loader.loadAsync(idleAnimationPath);
                    if (object.animations.length > 0) {
                        clip = object.animations[0];
                    }
                } else if (isVrma) {
                    // VRMA loading (simplified, might need specialized loader logic or createVRMAnimation)
                    // For now, let's assume standard gltf loader works for vrma structure if supported or just fallback
                    const loader = new GLTFLoader();
                    loader.register((parser: any) => new VRMLoaderPlugin(parser));
                    const gltfAnim = await loader.loadAsync(idleAnimationPath);
                    if (gltfAnim.userData.vrmAnimations && gltfAnim.userData.vrmAnimations.length > 0) {
                        // VRMA specific handling
                        // This is complex without @pixiv/three-vrm-animation, 
                        // but often vrm animations come as standard clips in gltf.animations too?
                        // Let's check standard animations first.
                        if (gltfAnim.animations && gltfAnim.animations.length > 0) {
                            clip = gltfAnim.animations[0];
                        }
                    }
                }

                if (clip) {
                    const m = new THREE.AnimationMixer(vrm.scene);
                    const action = m.clipAction(clip);

                    // Retargeting might be needed for FBX (Mixamo) to VRM
                    // VRMUtils.rotateVRM0(vrm.scene); // Maybe?
                    // Typically Mixamo needs bone renaming. 
                    // Since we can't easily include a full retargeting library here, 
                    // ensuring the user provides a compatible animation is best.
                    // Or precise bone mapping which is heavy.
                    // However, we can basic bind.

                    action.play();
                    setMixer(m);
                }

            } catch (e) {
                console.error("Failed to load idle animation:", e);
            }
        };

        loadAnim();

        return () => {
            if (mixer) mixer.stopAllAction();
        }

    }, [vrm, idleAnimationPath]);

    return <primitive object={gltf.scene} position={[0, -0.8, 0]} />; // Lowered a bit to center
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("VRM Avatar Error:", error, errorInfo);
        if (window.electronAPI && window.electronAPI.log) {
            window.electronAPI.log(`VRM Avatar Error: ${error.message}\nStack: ${errorInfo.componentStack}`);
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ color: 'red', padding: '20px', background: 'rgba(0,0,0,0.8)', borderRadius: '8px' }}>
                    <h3>Avatar Error</h3>
                    <pre style={{ fontSize: '10px' }}>{this.state.error?.message}</pre>
                    <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: '10px', background: 'red', color: 'white', border: 'none', padding: '5px 10px' }}>Retry</button>
                </div>
            );
        }
        return this.props.children;
    }
}

interface VrmAvatarRendererProps {
    avatarUrl: string;
    isSpeaking: boolean;
    scale?: number; // Not used inside canvas, but kept for interface compatibility if needed
    onLoaded?: () => void;
    controlsEnabled?: boolean;
    ambientLightIntensity?: number;
    idleAnimationPath?: string | null;
    vrmHdriPath?: string | null;
    vrmHdriIntensity?: number;
}

export const VrmAvatarRenderer = ({ avatarUrl, isSpeaking, onLoaded, controlsEnabled = false, ambientLightIntensity = 1.0,
    idleAnimationPath, vrmHdriPath, vrmHdriIntensity = 1.0
}: VrmAvatarRendererProps) => {
    console.log('[VrmAvatarRenderer] Props:', { ambientLightIntensity, idleAnimationPath });
    // Note: avatarUrl should be `avatar://${id}/${vrmFile}`
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ErrorBoundary>
                <Canvas
                    camera={{ fov: 30, position: [0, 0.0, 4.0] }}
                    gl={{ alpha: true, antialias: true }}
                    onCreated={({ gl }) => {
                        gl.setClearColor(new THREE.Color(0x000000), 0); // Transparent
                    }}
                >
                    <ambientLight intensity={ambientLightIntensity} />
                    <directionalLight position={[1, 1, 1]} intensity={1} />
                    {vrmHdriPath && (vrmHdriPath.endsWith('.hdr') || vrmHdriPath.endsWith('.exr')) && (
                        <Environment files={vrmHdriPath.startsWith('http') || vrmHdriPath.startsWith('file://') ? vrmHdriPath : `file:///${vrmHdriPath.replace(/\\/g, '/')}`} background={false} environmentIntensity={vrmHdriIntensity} />
                    )}
                    <VRMModel
                        url={avatarUrl}
                        isSpeaking={isSpeaking}
                        setIsLoading={(l) => { if (!l && onLoaded) onLoaded() }}
                        idleAnimationPath={idleAnimationPath ? (idleAnimationPath.startsWith('http') || idleAnimationPath.startsWith('file://') ? idleAnimationPath : `file:///${idleAnimationPath.replace(/\\/g, '/')}`) : undefined}
                    />
                    <OrbitControls enabled={controlsEnabled} target={[0, 0, 0]} mouseButtons={{ LEFT: -1 as any, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }} />

                    {/* Debug Overlay */}
                    <Html position={[0, 1.8, 0]} center style={{ pointerEvents: 'none', color: 'lime', textShadow: '1px 1px 1px black' }}>
                        <div style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                            Light: {ambientLightIntensity.toFixed(2)}<br />
                            Env: {vrmHdriPath ? 'ON' : 'OFF'} ({vrmHdriIntensity?.toFixed(2)})<br />
                            Anim: {idleAnimationPath ? 'ON' : 'OFF'}
                        </div>
                    </Html>
                </Canvas>
            </ErrorBoundary>
        </div>
    );
};
