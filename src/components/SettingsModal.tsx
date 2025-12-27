import { useState, useEffect, useRef } from 'react';
import { X, Layers, Monitor, Cpu, Mic, Volume2 } from 'lucide-react';
import { useSkin } from '../contexts/SkinContext';

// Internal StartupToggle component
const StartupToggle = () => {
    const [isEnabled, setIsEnabled] = useState(false);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.getStartupStatus().then(setIsEnabled);
        }
    }, []);

    const handleToggle = async () => {
        if (window.electronAPI) {
            const newState = await window.electronAPI.toggleStartup(!isEnabled);
            setIsEnabled(newState);
        }
    };

    return (
        <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isEnabled ? 'bg-green-500/50' : 'bg-white/10 group-hover:bg-white/20'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isEnabled ? 'left-4.5' : 'left-0.5'}`} />
            </div>
            <input type="checkbox" checked={isEnabled} onChange={handleToggle} className="hidden" />
        </label>
    );
};

interface SettingsModalProps {
    settings: any;
    onClose: () => void;
    onSettingsChange: (key: string, value: any) => void;
    onSelectAvatar?: (avatarId: string) => void;
    appVersion: string;
}

export const SettingsModal = ({ onClose, settings, onSettingsChange, onSelectAvatar, appVersion }: SettingsModalProps) => {
    const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'skin' | 'sound' | 'avatar'>('ai');
    const { availableSkins, loadSkin } = useSkin();

    // Audio Devices
    const [audioDevices, setAudioDevices] = useState<{ deviceId: string, label: string }[]>([]);

    // Audio Test State
    const [isTestingMic, setIsTestingMic] = useState(false);
    const [micLevel, setMicLevel] = useState(0);
    const micStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // VoiceVox Speaker State
    const [voicevoxSpeakers, setVoicevoxSpeakers] = useState<{ name: string, styles: { name: string, id: number }[] }[]>([]);
    const [voicevoxError, setVoicevoxError] = useState('');
    const [installedAvatars, setInstalledAvatars] = useState<{ id: string, name: string, path: string, type?: string }[]>([]);

    const fetchVoicevoxSpeakers = async () => {
        setVoicevoxError('');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

            const res = await fetch('http://localhost:50021/speakers', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                setVoicevoxSpeakers(data);
            } else {
                setVoicevoxError('Failed to connect (Check localhost:50021)');
            }
        } catch (e) {
            setVoicevoxError('Connection failed. Is VoiceVox running?');
        } finally {
        }
    };

    useEffect(() => {
        if (activeTab === 'sound') {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const inputs = devices.filter(d => d.kind === 'audioinput');
                setAudioDevices(inputs);
            }).catch(err => console.error("Error fetching audio devices:", err));
        }
        if (activeTab === 'avatar') {
            fetchInstalledAvatars();
        }
    }, [activeTab, settings.currentAvatarId, settings.avatarPath]);

    const fetchInstalledAvatars = async () => {
        if (window.electronAPI && window.electronAPI.getInstalledAvatars) {
            const avatars = await window.electronAPI.getInstalledAvatars();
            setInstalledAvatars(avatars);
        }
    };
    // Local state for form fields to avoid excessive re-renders in App
    const [localSettings, setLocalSettings] = useState(settings);
    const [rawSleepTimeout, setRawSleepTimeout] = useState('');

    // Sync sleep timeout when settings change (prop update) or on mount
    useEffect(() => {
        const val = settings.sleepTimeout !== undefined ? (settings.sleepTimeout / 60000) : 0.5;
        const currentVal = parseFloat(rawSleepTimeout);
        // Only update if the value is meaningfully different (prevents overwriting "0." with "0" while typing)
        if (isNaN(currentVal) || Math.abs(val - currentVal) > 0.001) {
            setRawSleepTimeout(val.toString());
        }
    }, [settings.sleepTimeout, rawSleepTimeout]);

    const supportedLanguages = [
        'Japanese', 'English', 'Chinese', 'Korean', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian'
    ];

    const geminiModels = [
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-flash-latest",
        "gemini-pro-latest",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);


    // Audio Testing Utilities
    const stopMicTest = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            micStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setIsTestingMic(false);
        setMicLevel(0);
    };

    const testMicrophone = async () => {
        if (isTestingMic) {
            stopMicTest();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: localSettings.inputDeviceId && localSettings.inputDeviceId !== 'default'
                        ? { exact: localSettings.inputDeviceId }
                        : undefined
                }
            });

            micStreamRef.current = stream;
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const analyser = audioContext.createAnalyser();
            analyserRef.current = analyser;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const updateLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                // Normalize 0-255 to 0-100 roughly
                const level = Math.min(100, Math.round((average / 128) * 100)); // Amplify a bit
                setMicLevel(level);
                animationFrameRef.current = requestAnimationFrame(updateLevel);
            };

            setIsTestingMic(true);
            updateLevel();

        } catch (err) {
            console.error("Microphone test failed:", err);
            setIsTestingMic(false);
        }
    };

    // Cleanup mic test on unmount or tab switch
    useEffect(() => {
        return () => stopMicTest();
    }, []);

    const testSpeaker = (_arg?: any) => {
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        oscillator.stop(audioContext.currentTime + 0.5); // 0.5 seconds

        setTimeout(() => {
            audioContext.close();
        }, 600);
    };

    // Debounced Settings Update


    const updateTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

    const handleChange = (key: string, value: any) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));

        if (updateTimeoutRef.current[key]) clearTimeout(updateTimeoutRef.current[key]);

        updateTimeoutRef.current[key] = setTimeout(() => {
            onSettingsChange(key, value);
            delete updateTimeoutRef.current[key];
        }, 500); // 500ms debounce
    };

    // Cleanup timeouts
    useEffect(() => {
        return () => {
            Object.values(updateTimeoutRef.current).forEach(clearTimeout);
        };
    }, []);

    // Sync from props
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // Skin logic
    const handleSkinSelect = async (skinId: string) => {
        // await loadSkin(skinId); // Skin loading handled by App/Context reactively?
        // Skin needs to be saved to settings? 
        // Skin needs to be saved to settings? 
        // Current implementation of SkinContext doesn't save preference to settings, it just loads. 
        // We should probably save `skinId` to settings.
        // But `skinId` isn't in default settings yet.
        // Let's add it to localSettings and let App save it.
        // But App doesn't know about `skinId` field yet.
        // We can just rely on dataManager later if we add it. 
        // For now, let's assume SkinContext persistence is handled? 
        // Actually SkinContext *doesn't* persist. It loads from settings *if* we implemented that.
        // Wait, `window.electronAPI.getSettings()` returns `theme`? No.
        // We need to adding `skinId` to settings.
        // Let's assume we can add arbitrary fields to settings object.
        handleChange('skinId', skinId);
    };



    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b border-white/10 bg-black/20">
                    <h2 className="text-xs font-bold tracking-widest text-white flex items-center gap-2">
                        <SettingsIcon tab={activeTab} /> SETTINGS
                    </h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex bg-black/40 border-b border-white/5">
                    <TabButton id="ai" label="AI Models" icon={<Cpu size={14} />} active={activeTab} onClick={setActiveTab} />
                    <TabButton id="sound" label="Sound" icon={<Volume2 size={14} />} active={activeTab} onClick={setActiveTab} />
                    <TabButton id="avatar" label="Avatar" icon={<Monitor size={14} />} active={activeTab} onClick={setActiveTab} />
                    <TabButton id="skin" label="Skin" icon={<Layers size={14} />} active={activeTab} onClick={setActiveTab} />
                    <div className="border-t border-white/5 my-2" />
                    <TabButton id="general" label="System" icon={<Monitor size={14} />} active={activeTab} onClick={setActiveTab} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

                    {/* AVATAR TAB */}
                    {activeTab === 'avatar' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
                                    <Monitor size={14} /> Avatar Settings
                                </h3>

                                {/* Visibility Toggle */}
                                <div className="flex items-center justify-between">
                                    <Label>Show Avatar</Label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${localSettings.avatarVisible ? 'bg-blue-500/50' : 'bg-white/10 group-hover:bg-white/20'} `}>
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${localSettings.avatarVisible ? 'left-4.5' : 'left-0.5'} `} />
                                        </div>
                                        <input type="checkbox" checked={localSettings.avatarVisible || false} onChange={(e) => handleChange('avatarVisible', e.target.checked)} className="hidden" />
                                    </label>
                                </div>

                                {/* Always On Top */}
                                <div className="flex justify-between items-center py-2">
                                    <Label>Always On Top</Label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${localSettings.alwaysOnTop !== false ? 'bg-blue-500/50' : 'bg-white/10 group-hover:bg-white/20'} `}>
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${localSettings.alwaysOnTop !== false ? 'left-4.5' : 'left-0.5'} `} />
                                        </div>
                                        <input type="checkbox" checked={localSettings.alwaysOnTop !== false} onChange={(e) => handleChange('alwaysOnTop', e.target.checked)} className="hidden" />
                                    </label>
                                </div>

                                {/* Auto Blink */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label>Auto Blink</Label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${localSettings.autoBlink !== false ? 'bg-blue-500/50' : 'bg-white/10 group-hover:bg-white/20'} `}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${localSettings.autoBlink !== false ? 'left-4.5' : 'left-0.5'} `} />
                                            </div>
                                            <input type="checkbox" checked={localSettings.autoBlink !== false} onChange={(e) => handleChange('autoBlink', e.target.checked)} className="hidden" />
                                        </label>
                                    </div>
                                    <div className="text-[10px] text-white/40">Enable automatic blinking behavior.</div>
                                </div>

                                {(() => {
                                    const currentAvatar = installedAvatars.find(a => a.id === localSettings.currentAvatarId);
                                    if (currentAvatar?.type === 'VRM') {
                                        const avatarConfig = localSettings.vrmConfigs?.[currentAvatar.id] || {};

                                        const updateVrmConfig = (key: string, value: any) => {
                                            const newConfigs = {
                                                ...localSettings.vrmConfigs,
                                                [currentAvatar.id]: {
                                                    ...avatarConfig,
                                                    [key]: value
                                                }
                                            };
                                            handleChange('vrmConfigs', newConfigs);
                                        };

                                        return (
                                            <>
                                                {/* VRM Ambient Light Intensity */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <Label>VRM Ambient Light</Label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="range"
                                                                min="0.1"
                                                                max="2.0"
                                                                step="0.1"
                                                                value={avatarConfig.ambientLightIntensity ?? 1.0}
                                                                onChange={(e) => updateVrmConfig('ambientLightIntensity', parseFloat(e.target.value))}
                                                                className="w-24 accent-blue-500 bg-black/30 rounded-lg appearance-none h-1.5 cursor-pointer"
                                                            />
                                                            <span className="text-xs text-white/70 w-8 text-right">
                                                                {(avatarConfig.ambientLightIntensity ?? 1.0).toFixed(1)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] text-white/40">Adjust ambient lighting for this VRM model.</div>
                                                </div>

                                                {/* VRM HDRI Environment */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <Label>Environment Map (HDRI)</Label>
                                                        {avatarConfig.hdriPath && (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="range"
                                                                    min="0.1"
                                                                    max="5.0"
                                                                    step="0.1"
                                                                    value={avatarConfig.hdriIntensity ?? 1.0}
                                                                    onChange={(e) => updateVrmConfig('hdriIntensity', parseFloat(e.target.value))}
                                                                    className="w-16 accent-green-500 bg-black/30 rounded-lg appearance-none h-1.5 cursor-pointer"
                                                                />
                                                                <span className="text-xs text-white/70 w-8 text-right">
                                                                    {(avatarConfig.hdriIntensity ?? 1.0).toFixed(1)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1.5 text-xs text-white/50 truncate">
                                                            {avatarConfig.hdriPath ? avatarConfig.hdriPath.split(/[\\/]/).pop() : 'None'}
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (window.electronAPI && window.electronAPI.selectFile) {
                                                                    const path = await window.electronAPI.selectFile({
                                                                        title: 'Select HDRI Environment (.hdr, .exr)',
                                                                        filters: [{ name: 'HDRI', extensions: ['hdr', 'exr'] }]
                                                                    });
                                                                    if (path) {
                                                                        updateVrmConfig('hdriPath', path);
                                                                    }
                                                                }
                                                            }}
                                                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                                                        >
                                                            Browse
                                                        </button>
                                                        {avatarConfig.hdriPath && (
                                                            <button
                                                                onClick={() => {
                                                                    updateVrmConfig('hdriPath', null);
                                                                    updateVrmConfig('hdriIntensity', 1.0);
                                                                }}
                                                                className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-xs transition-colors"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-white/40">Load .hdr/.exr for realistic lighting and reflections.</div>
                                                </div>

                                                {/* VRM Idle Animation */}
                                                <div className="space-y-2">
                                                    <Label>VRM Idle Animation (Optional)</Label>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1.5 text-xs text-white/50 truncate">
                                                            {avatarConfig.idleAnimationPath ? avatarConfig.idleAnimationPath : 'Default (Breathing)'}
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (window.electronAPI && window.electronAPI.selectFile) {
                                                                    const path = await window.electronAPI.selectFile({
                                                                        title: 'Select Idle Animation (FBX, VRMA)',
                                                                        filters: [{ name: 'Animations', extensions: ['fbx', 'vrma'] }]
                                                                    });
                                                                    if (path) {
                                                                        updateVrmConfig('idleAnimationPath', path);
                                                                    }
                                                                }
                                                            }}
                                                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-colors"
                                                        >
                                                            Browse
                                                        </button>
                                                        {avatarConfig.idleAnimationPath && (
                                                            <button
                                                                onClick={() => updateVrmConfig('idleAnimationPath', null)}
                                                                className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-xs transition-colors"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-white/40">Select an animation file for this specific avatar.</div>
                                                </div>
                                            </>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Sleep Timeout */}
                                {/* Sleep Timeout */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label>Sleep Timeout (min)</Label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={rawSleepTimeout}
                                                onChange={(e) => {
                                                    setRawSleepTimeout(e.target.value);
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val)) {
                                                        handleChange('sleepTimeout', val * 60000);
                                                    }
                                                }}
                                                className="w-16 bg-black/20 border border-white/10 rounded p-1 text-right text-xs text-white"
                                            />
                                            <span className="text-xs text-white/50">min</span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-white/40">Set to 0 to disable sleep.</div>
                                </div>

                                {/* Installed Avatars List */}
                                <div className="space-y-2 pt-4 border-t border-white/10">
                                    <Label>Installed Avatars</Label>
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar bg-black/20 p-2 rounded">
                                        {installedAvatars.length === 0 ? (
                                            <div className="text-xs text-white/30 text-center py-2">No avatars installed</div>
                                        ) : (
                                            installedAvatars.map(avatar => {
                                                const type = avatar.type || 'EMG';
                                                let badgeColor = 'bg-blue-400/10 text-blue-400'; // EMG
                                                if (type === 'Ukagaka') badgeColor = 'bg-pink-400/10 text-pink-400';
                                                if (type === 'VRM') badgeColor = 'bg-green-400/10 text-green-400';

                                                return (
                                                    <div
                                                        key={avatar.id}
                                                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${localSettings.currentAvatarId === avatar.id ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-white/5 hover:bg-white/10'} `}
                                                        onClick={() => onSelectAvatar && onSelectAvatar(avatar.id)}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <span className={`text-[9px] px-1 rounded border border-white/5 ${badgeColor} `}>{type}</span>
                                                            <span className="text-xs text-white/80 select-none truncate">{avatar.name}</span>
                                                        </div>
                                                        <div className="flex gap-2 shrink-0">
                                                            {localSettings.currentAvatarId === avatar.id && (
                                                                <span className="text-[10px] text-green-400 bg-green-400/10 px-1 rounded">Active</span>
                                                            )}
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation(); // Prevent selection when deleting
                                                                    // Use local component state or handler defined above
                                                                    if (confirm('Are you sure you want to delete this avatar?')) {
                                                                        if (window.electronAPI && window.electronAPI.deleteAvatar) {
                                                                            const success = await window.electronAPI.deleteAvatar(avatar.id);
                                                                            if (success) {
                                                                                fetchInstalledAvatars();
                                                                            }
                                                                        }
                                                                    }
                                                                }}
                                                                className="text-white/40 hover:text-red-400"
                                                                title="Delete"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                <div className="block pt-4 border-t border-white/5 space-y-4">
                                    {/* File Loader */}
                                    <div className="space-y-2">
                                        <Label>Avatar File</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={localSettings.avatarPath ? localSettings.avatarPath.split(/[/\\]/).pop() : ''}
                                                readOnly
                                                placeholder="No .emgl / .zip loaded"
                                                className="text-xs flex-1 bg-black/20 font-mono"
                                                title={localSettings.avatarPath || "No file loaded"}
                                            />
                                            <button
                                                onClick={async () => {
                                                    if (window.electronAPI && window.electronAPI.selectFile) {
                                                        const path = await window.electronAPI.selectFile({ filters: [{ name: 'Avatar Package', extensions: ['emgl', 'zip'] }] });
                                                        if (path) handleChange('avatarPath', path);
                                                    }
                                                }}
                                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors whitespace-nowrap"
                                            >
                                                Load
                                            </button>
                                        </div>
                                        <div className="text-[10px] text-white/40">Supported: .emgl, .zip</div>
                                    </div>

                                    {/* Ghost Import (Ukagaka) */}
                                    <div className="pt-2 border-t border-white/5">
                                        <Label>Import Avatar</Label>
                                        <div className="flex gap-2 mt-1">
                                            <button
                                                onClick={async () => {
                                                    if (window.electronAPI && window.electronAPI.installUkagakaGhost) {
                                                        const newAvatarId = await window.electronAPI.installUkagakaGhost();
                                                        if (newAvatarId) {
                                                            alert(`Ghost installed: ${newAvatarId} `);
                                                            fetchInstalledAvatars();
                                                        }
                                                    }
                                                }}
                                                className="flex-1 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Layers size={14} /> Import .nar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (window.electronAPI && (window.electronAPI as any).installVRM) {
                                                        const newAvatarId = await (window.electronAPI as any).installVRM();
                                                        if (newAvatarId) {
                                                            alert(`VRM installed: ${newAvatarId} `);
                                                            fetchInstalledAvatars();
                                                        }
                                                    }
                                                }}
                                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Monitor size={14} /> Import VRM
                                            </button>
                                        </div>
                                        <div className="text-[10px] text-white/40 mt-1">Supports Ukagaka (.nar) and VRM models.</div>
                                    </div>

                                    {/* Scale Slider */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <Label>Scale</Label>
                                            <span className="text-xs font-mono">{localSettings.avatarScale?.toFixed(1) || '1.0'}x</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="2.0"
                                            step="0.1"
                                            value={localSettings.avatarScale || 1.0}
                                            onChange={(e) => handleChange('avatarScale', parseFloat(e.target.value))}
                                            className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* Reset Position */}
                                    <div className="pt-2">
                                        <button
                                            onClick={() => handleChange('avatarPosition', { x: 0, y: 0 })}
                                            className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-white/70 transition-colors"
                                        >
                                            Reset Position
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* AI TAB */}
                    {activeTab === 'ai' && (
                        <div className="space-y-4">
                            {/* Provider Selector */}
                            <div className="space-y-2">
                                <Label>AI Provider</Label>
                                <div className="flex gap-2">
                                    <ProviderButton id="gemini" label="GEMINI" color="blue" current={localSettings.provider} onClick={(p) => handleChange('provider', p)} />
                                    <ProviderButton id="openai" label="GPT (OpenAI)" color="purple" current={localSettings.provider} onClick={(p) => handleChange('provider', p)} />
                                    <ProviderButton id="local" label="LOCAL LLM" color="green" current={localSettings.provider} onClick={(p) => handleChange('provider', p)} />
                                </div>
                            </div>

                            {localSettings.provider === 'gemini' && (
                                <div className="space-y-3 bg-white/5 p-3 rounded border border-white/5">
                                    <div className="space-y-1">
                                        <Label>Gemini API Key</Label>
                                        <Input
                                            type="password"
                                            value={localSettings.geminiApiKey || localSettings.apiKey || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('geminiApiKey', e.target.value)}
                                            placeholder="Enter your Gemini API key..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Model</Label>
                                        <select
                                            value={localSettings.geminiModelName || "gemini-2.0-flash"}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange('geminiModelName', e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs font-mono focus:border-blue-500/50 outline-none"
                                        >
                                            {geminiModels.map(m => <option key={m} value={m} className="bg-neutral-900">{m}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {localSettings.provider === 'openai' && (
                                <div className="space-y-3 bg-white/5 p-3 rounded border border-white/5">
                                    <div className="space-y-1">
                                        <Label>API Key</Label>
                                        <Input
                                            type="password"
                                            value={localSettings.openaiApiKey || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('openaiApiKey', e.target.value)}
                                            placeholder="sk-..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Base URL</Label>
                                        <Input
                                            value={localSettings.openaiBaseUrl || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('openaiBaseUrl', e.target.value)}
                                            placeholder="https://api.openai.com/v1"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Model Name</Label>
                                        <Input
                                            list="openai-models"
                                            value={localSettings.openaiModelName || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('openaiModelName', e.target.value)}
                                            placeholder="gpt-4o, grok-beta..."
                                        />
                                        <datalist id="openai-models">
                                            <option value="gpt-5.2" />
                                            <option value="gpt-5.2-instant" />
                                            <option value="gpt-5.2-codex" />
                                            <option value="gpt-5" />
                                            <option value="grok-beta" />
                                            <option value="gpt-4o" />
                                            <option value="gpt-4o-mini" />
                                            <option value="gpt-4-turbo" />
                                            <option value="gpt-3.5-turbo" />
                                        </datalist>
                                    </div>
                                </div>
                            )}



                            {localSettings.provider === 'local' && (
                                <div className="space-y-3 bg-white/5 p-3 rounded border border-white/5">
                                    <div className="p-3 text-center text-white/50 text-xs italic">
                                        Ensure your Local LLM (e.g., Ollama) is running.
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Base URL</Label>
                                        <Input
                                            value={localSettings.localBaseUrl || 'http://localhost:11434/v1'}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('localBaseUrl', e.target.value)}
                                            placeholder="http://localhost:11434/v1"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Model Name</Label>
                                        <Input
                                            value={localSettings.localModelName || 'llama3'}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('localModelName', e.target.value)}
                                            placeholder="llama3"
                                        />
                                    </div>
                                </div>
                            )}



                            {/* Usage Stats (Placeholder for now, could be passed in props if available) */}
                            {/* <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-200">
                                <span className="font-bold">ESTIMATED USAGE:</span> 12,500 Tokens (Session)
                            </div> */}
                        </div>
                    )}

                    {/* SKIN TAB */}
                    {activeTab === 'skin' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                {/* Default Skin Option */}
                                <div
                                    onClick={() => handleSkinSelect('default')}
                                    className={`
            cursor - pointer rounded - lg border p - 2 flex flex - col gap - 2 transition - all
                                    ${localSettings.skinId === 'default' ? 'bg-white/10 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}
            `}
                                >
                                    <div className="h-16 rounded bg-black/50 flex items-center justify-center text-white/20 overflow-hidden relative">
                                        <Layers size={24} />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-white truncate">Default (Dark)</div>
                                        <div className="text-[10px] text-white/50 truncate">Monolith Standard</div>
                                    </div>
                                </div>
                                {availableSkins.map((s) => (
                                    <div
                                        key={s.id}
                                        onClick={() => handleSkinSelect(s.id)}
                                        className={`
            cursor - pointer rounded - lg border p - 2 flex flex - col gap - 2 transition - all
                                    ${localSettings.skinId === s.id ? 'bg-white/10 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}
            `}
                                    >
                                        <div className="h-16 rounded bg-black/50 flex items-center justify-center text-white/20 overflow-hidden relative">
                                            {/* Preview if available */}
                                            {/* We can construct a preview URL if we had one in metadata */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                                            <Layers size={24} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white truncate">{s.name}</div>
                                            <div className="text-[10px] text-white/50 truncate">{s.author || 'Unknown'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SOUND TAB (Consolidated Speech + Audio) */}
                    {activeTab === 'sound' && (
                        <div className="space-y-6">
                            {/* SECTION: AUDIO INPUT */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
                                    <Mic size={14} /> Voice Input
                                </h3>
                                <div className="flex items-center justify-between">
                                    <Label>Enable Voice Input</Label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w - 8 h - 4 rounded - full relative transition - colors duration - 300 ${localSettings.voiceInputEnabled ? 'bg-red-500/50' : 'bg-white/10 group-hover:bg-white/20'} `}>
                                            <div className={`absolute top - 0.5 w - 3 h - 3 rounded - full bg - white transition - all duration - 300 ${localSettings.voiceInputEnabled ? 'left-4.5' : 'left-0.5'} `} />
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={localSettings.voiceInputEnabled || false}
                                            onChange={(e) => handleChange('voiceInputEnabled', e.target.checked)}
                                            className="hidden"
                                        />
                                    </label>
                                </div>

                                {localSettings.voiceInputEnabled && (
                                    <>
                                        {/* Wake Word Config */}
                                        <div className="p-3 bg-white/5 rounded border border-white/5 space-y-3">
                                            <div>
                                                <Label>Wake Word (Offline)</Label>
                                                <div className="text-[10px] text-white/40 mb-1">Phrase to activate listening</div>
                                                <Input
                                                    value={localSettings.wakeWord || 'Computer'}
                                                    onChange={(e: any) => handleChange('wakeWord', e.target.value)}
                                                    placeholder="e.g. Computer"
                                                    className="text-xs"
                                                />
                                            </div>
                                            <div>
                                                <Label>Wake Word Timeout (ms)</Label>
                                                <Input type="number" value={localSettings.wakeWordTimeout || 3000} onChange={(e: any) => handleChange('wakeWordTimeout', parseInt(e.target.value))} className="text-xs" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Transcription Model</Label>
                                            <select
                                                value={localSettings.transcriptionProvider || 'native'}
                                                onChange={(e) => handleChange('transcriptionProvider', e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs font-mono focus:border-blue-500/50 outline-none"
                                            >
                                                <option value="native">Browser Native (WebSpeech)</option>
                                                <option value="groq">Groq (Whisper)</option>
                                                <option value="openai">OpenAI (Whisper)</option>
                                            </select>
                                        </div>

                                        {localSettings.transcriptionProvider === 'groq' && (
                                            <div className="space-y-1 bg-white/5 p-3 rounded border border-white/5">
                                                <Label>Groq API Key</Label>
                                                <Input
                                                    type="password"
                                                    value={localSettings.groqApiKey || ''}
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('groqApiKey', e.target.value)}
                                                    placeholder="gsk_..."
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label>Input Device</Label>
                                            <select
                                                value={localSettings.inputDeviceId || ''}
                                                onChange={(e) => handleChange('inputDeviceId', e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs font-mono focus:border-blue-500/50 outline-none"
                                            >
                                                <option value="">Default</option>
                                                {audioDevices.map(device => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Mic Test */}
                                        <div className="p-3 bg-black/40 rounded border border-white/10 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <Label>Microphone Test</Label>
                                                <button
                                                    onClick={isTestingMic ? stopMicTest : testMicrophone}
                                                    className={`text - [10px] px - 2 py - 1 rounded border transition - colors ${isTestingMic
                                                        ? 'bg-red-500/20 border-red-500 text-red-200'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                        }`}
                                                >
                                                    {isTestingMic ? 'STOP TEST' : 'START TEST'}
                                                </button>
                                            </div>
                                            {isTestingMic && (
                                                <div className="h-1 bg-white/10 rounded overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500 transition-all duration-75 ease-out"
                                                        style={{ width: `${Math.min(100, micLevel * 100)} % ` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* SECTION: TTS */}
                            <div className="space-y-4 pt-4 border-t border-white/10">
                                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-2">
                                    <Volume2 size={14} /> Text-to-Speech
                                </h3>
                                <div className="flex items-center justify-between">
                                    <Label>Enable TTS</Label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w - 8 h - 4 rounded - full relative transition - colors duration - 300 ${localSettings.ttsEnabled ? 'bg-green-500/50' : 'bg-white/10 group-hover:bg-white/20'}`}>
                                            <div className={`absolute top - 0.5 w - 3 h - 3 rounded - full bg - white transition - all duration - 300 ${localSettings.ttsEnabled ? 'left-4.5' : 'left-0.5'}`} />
                                        </div>
                                        <input type="checkbox" checked={localSettings.ttsEnabled || false} onChange={(e) => handleChange('ttsEnabled', e.target.checked)} className="hidden" />
                                    </label>
                                </div>

                                {localSettings.ttsEnabled && (
                                    <div className="space-y-4 border-t border-white/5 pt-4">
                                        <div className="space-y-2">
                                            <Label>TTS Provider</Label>
                                            <div className="flex gap-2">
                                                <ProviderButton id="browser" label="Browser" color="bg-blue-500" current={localSettings.ttsProvider || 'browser'} onClick={(val) => handleChange('ttsProvider', val)} />
                                                <ProviderButton id="voicevox" label="VoiceVox" color="bg-green-500" current={localSettings.ttsProvider} onClick={(val) => { handleChange('ttsProvider', val); fetchVoicevoxSpeakers(); }} />
                                            </div>
                                        </div>

                                        {localSettings.ttsProvider === 'voicevox' && (
                                            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <div className="text-xs text-green-200">VoiceVox Settings (Localhost:50021)</div>
                                                    <button onClick={() => testSpeaker(localSettings.ttsVoice)} className="text-[10px] px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded border border-green-500/30">Test Voice</button>
                                                </div>
                                                {voicevoxError && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{voicevoxError}</div>}
                                                <div className="space-y-1">
                                                    <Label>Speaker</Label>
                                                    {voicevoxSpeakers.length > 0 ? (
                                                        <select value={localSettings.ttsVoice || ''} onChange={(e) => handleChange('ttsVoice', e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-1.5 text-white text-xs font-mono outline-none">
                                                            <option value="">Select a Speaker</option>
                                                            {voicevoxSpeakers.map(s => (
                                                                <optgroup key={s.name} label={s.name}>
                                                                    {s.styles.map(st => <option key={st.id} value={st.id}>{s.name} ({st.name})</option>)}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <Input type="number" value={localSettings.ttsVoice || '1'} onChange={(e: any) => handleChange('ttsVoice', e.target.value)} placeholder="Speaker ID" />
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label>Summary Prompt (Long Text)</Label>
                                            <textarea value={localSettings.ttsSummaryPrompt || ''} onChange={(e) => handleChange('ttsSummaryPrompt', e.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white h-16 focus:outline-none resize-none" placeholder="Summarize for speech..." />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Summary Threshold (Chars)</Label>
                                            <Input type="number" value={localSettings.ttsSummaryThreshold ?? 400} onChange={(e: any) => handleChange('ttsSummaryThreshold', parseInt(e.target.value))} className="text-xs" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* GENERAL TAB */}
                    {activeTab === 'general' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Run on Startup</Label>
                                <StartupToggle />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Developer Mode</Label>
                                    <p className="text-[10px] text-white/40">Show raw transcription logs in chat.</p>
                                </div>
                                <button
                                    onClick={() => handleChange('developerMode', !localSettings.developerMode)}
                                    className={`w - 10 h - 5 rounded - full transition - colors relative ${localSettings.developerMode ? 'bg-amber-500' : 'bg-white/20'}`}
                                >
                                    <div className={`absolute top - 1 left - 1 w - 3 h - 3 rounded - full bg - white transition - transform ${localSettings.developerMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="space-y-1">
                                <Label>Base Language</Label>
                                <select
                                    value={localSettings.targetLanguage || 'Japanese'}
                                    onChange={(e) => handleChange('targetLanguage', e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-white text-xs font-mono focus:border-blue-500/50 outline-none"
                                >
                                    {supportedLanguages.map(lang => (
                                        <option key={lang} value={lang} className="bg-neutral-900">{lang}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <Label>Appearance (Theme Color)</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={localSettings.themeColor || '#ef4444'}
                                        onChange={(e) => handleChange('themeColor', e.target.value)}
                                        className="h-6 w-6 rounded cursor-pointer bg-transparent border-none"
                                    />
                                    <span className="text-xs text-white/70 font-mono">{localSettings.themeColor}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Log Directory</Label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-white/5 border border-white/10 rounded p-1.5 text-[10px] font-mono text-white/70 truncate">
                                        {localSettings.logDirectory || 'Default'}
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (window.electronAPI) {
                                                const path = await window.electronAPI.selectDirectory();
                                                if (path) {
                                                    const success = await window.electronAPI.setLogDirectory(path);
                                                    if (success) handleChange('logDirectory', path);
                                                }
                                            }
                                        }}
                                        className="px-2 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold transition-colors"
                                    >
                                        CHANGE
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-3 border-t border-white/10 flex justify-between items-center bg-black/20">
                    <span className="text-[10px] text-white/30 font-mono">v{appVersion}</span>
                    <button onClick={onClose} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold tracking-wider transition-colors">
                        CLOSE
                    </button>
                </div>

            </div>

        </div >

    );
};

// UI Components for Settings
function TabButton({ id, label, icon, active, onClick }: { id: string, label: string, icon: React.ReactNode, active: string, onClick: (id: any) => void }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-wider transition-all border-b-2 ${active === id ? 'border-blue-500 text-white bg-white/5' : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/5'}`}
        >
            {icon} {label}
        </button>
    );
}

function ProviderButton({ id, label, color, current, onClick }: { id: string, label: string, color: string, current: string, onClick: (id: string) => void }) {
    const isSelected = current === id;
    const bg = isSelected ? `bg-${color}-500` : 'bg-white/5 hover:bg-white/10 text-white/50';
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-colors ${isSelected ? 'text-white' : ''} ${bg} `}
            style={isSelected ? { backgroundColor: color === 'blue' ? '#3b82f6' : color === 'purple' ? '#a855f7' : color === 'green' ? '#22c55e' : '#f97316' } : {}}
        >
            {label}
        </button>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">{children}</label>;
}

function Input({ className, ...props }: any) {
    return (
        <input
            className={`w-full bg-white/5 border border-white/10 rounded p-1.5 text-white text-xs font-mono focus:border-white/30 outline-none transition-colors ${className || ''} `}
            {...props}
        />
    );
}

function SettingsIcon({ tab }: { tab: string }) {
    if (tab === 'ai') return <Cpu size={14} className="text-blue-400" />;
    if (tab === 'speech') return <Volume2 size={14} className="text-yellow-400" />;
    if (tab === 'audio') return <Mic size={14} className="text-red-400" />;
    if (tab === 'skin') return <Layers size={14} className="text-purple-400" />;
    return <Monitor size={14} className="text-green-400" />;
}
