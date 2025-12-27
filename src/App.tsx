import { useState, useEffect, useRef } from 'react'
import { Settings } from 'lucide-react';
import { aiService } from './services/aiService';
import { Header } from './components/Header';
import { InputArea } from './components/InputArea';
import { HistoryList, type HistoryItem } from './components/HistoryList';
import { SettingsModal } from './components/SettingsModal';
import { DateDisplay } from './components/DateDisplay';
import { AvatarRenderer } from './components/AvatarRenderer';
import { useAvatar } from './hooks/useAvatar';
import { useWindowControl } from './hooks/useWindowControl';
import { useSettings } from './hooks/useSettings';
import { useTTS } from './hooks/useTTS';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useAIConversation } from './hooks/useAIConversation';

function App() {
  // Check for Avatar Mode
  const searchParams = new URLSearchParams(window.location.search);
  const isAvatarMode = searchParams.get('mode') === 'avatar';

  const [inputText, setInputText] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'clipboard' | 'transcription'>('chat');
  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [showSettings, setShowSettings] = useState(false)

  // Settings Management (Hook)
  const { settings, updateSettings, isLoaded: settingsLoaded } = useSettings();
  const {
    apiKey, geminiApiKey, geminiModelName, groqApiKey, openaiApiKey,
    provider, localBaseUrl, localModelName, openaiBaseUrl, openaiModelName,
    themeColor, logDirectory, targetLanguage, skinId, systemPrompt, additionalPrompt,
    isClipboardEnabled, developerMode,
    ttsEnabled, ttsProvider, ttsVoice, ttsSummaryPrompt, ttsSummaryThreshold,
    inputDeviceId, wakeWord, voiceInputEnabled, wakeWordTimeout, transcriptionProvider,
    avatarVisible: settingAvatarVisible, // Alias to avoid conflict with useAvatar
    avatarScale: settingAvatarScale, // Alias
    avatarPosition, avatarPath, sleepTimeout, alwaysOnTop, autoBlink
  } = settings;
  const [isConversationMode, setIsConversationMode] = useState(false);

  // --- Hooks Integration ---

  // 1. Text-To-Speech Hook
  const {
    speak,
    cancel: cancelTTS,
    isSpeaking: isTTSSpeaking,
    isSummarizing: isTTSSummarizing
  } = useTTS({ settings });

  // 2. AI Conversation Hook
  const {
    history,
    setHistory,
    sendMessage,
    clearHistory,
    abort: abortAI,
    isProcessing: isAIProcessing,
    isThinking: isAIThinking
  } = useAIConversation({
    settings,
    onResponse: (text) => speak(text)
  });

  // 3. Voice Input Hook
  // Wrapper for handleExecute to match legacy signature required by useVoiceInput callback if needed?
  // Actually useVoiceInput calls onTranscriptionComplete(text).
  // We want to route that to sendMessage.
  // We also want to stop TTS if speaking.

  const handleVoiceCommand = async (text: string) => {
    if (isTTSSpeaking) cancelTTS();
    await sendMessage(text);
  };

  const {
    isRecording,
    isWakeWordActive,
    toggleRecording
  } = useVoiceInput({
    settings,
    onTranscriptionComplete: handleVoiceCommand
  });

  // --- Compatibility / UI Helpers ---

  // Legacy Wrapper for InputArea
  const handleExecute = async (overrideText?: string, _isVoiceCommand: boolean = false) => {
    const textToProcess = overrideText !== undefined ? overrideText : inputText;
    if (!textToProcess.trim()) return;

    if (isTTSSpeaking) cancelTTS();

    await sendMessage(textToProcess);

    if (overrideText === undefined) {
      setInputText('');
    }
  };

  const handleStop = () => {
    abortAI();
    cancelTTS();
    // setIsThinking handled by hooks
  };

  // UI State Sync
  const isSummarizing = isTTSSummarizing; // For InputArea
  const isProcessing = isAIProcessing || isSummarizing;
  const isThinking = isAIThinking || isSummarizing;

  // Legacy Aliases
  const handleMicClick = toggleRecording;
  const handleClearHistory = clearHistory;
  const stopSpeaking = cancelTTS;
  const isSpeaking = isTTSSpeaking; // Used for Avatar Sync

  const [appVersion, setAppVersion] = useState('0.10.5');
  const isClipboardEnabledRef = useRef(isClipboardEnabled);

  // Hook Integration (Avatar)
  const {
    avatarData,
    currentAvatarId,
    avatarScale,
    setAvatarScale,
    switchInstalledAvatar,
    loadAvatar
  } = useAvatar();

  const {
    cameraControlMode,
    setCameraControlMode
  } = useWindowControl({
    isAvatarMode,
    avatarVisible: settingAvatarVisible,
    currentAvatarId,
    developerMode,
    onShowCostumeMenu: (id, _camMode) => {
      if (window.electronAPI && window.electronAPI.showCostumeMenu) {
        window.electronAPI.showCostumeMenu(id, []);
      }
    }
  });

  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [isSleeping, setIsSleeping] = useState(false);

  // Refs for tracking changes
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef(Date.now());
  const lastAutoScaledPath = useRef<string | null>(null);

  // Wake up avatar when speaking (TTS)
  useEffect(() => {
    if (isSpeaking && isSleeping) {
      setIsSleeping(false);
      resetIdleTimer();
    }
  }, [isSpeaking, isSleeping]);

  // Update ref when state changes
  useEffect(() => {
    isClipboardEnabledRef.current = isClipboardEnabled;
  }, [isClipboardEnabled]);

  const handleSettingsUpdate = (newSettings: any) => {
    updateSettings(newSettings);

    // Sync Runtime State for Avatar
    // Note: useAvatar should ideally listen to settings, but here we push changes for immediate effect if needed?
    // Actually useAvatar manages its own internal state, initialized from settings?
    // Let's keep this sync for now.
    // Note: useAvatar manages its own internal state, but we rely on settings as Truth for visibility now.
    // if (newSettings.avatarVisible !== undefined) setAvatarVisible(newSettings.avatarVisible);
    if (newSettings.avatarScale !== undefined) setAvatarScale(newSettings.avatarScale);

    // Side Effects
    if (newSettings.avatarPath) {
      loadAvatar(newSettings.avatarPath);
      lastAutoScaledPath.current = newSettings.avatarPath;
    }
    else if (newSettings.currentAvatarId && !newSettings.avatarPath) {
      if (!avatarData || currentAvatarId !== newSettings.currentAvatarId) {
        switchInstalledAvatar(newSettings.currentAvatarId);
      }
    }

    if (newSettings.skinId && window.electronAPI && window.electronAPI.loadSkin) {
      window.electronAPI.loadSkin(newSettings.skinId);
    }

    aiService.updateSettings({ ...settings, ...newSettings });
  };

  const handleSettingsChange = (key: string, value: any) => {
    handleSettingsUpdate({ [key]: value });
  };

  // Listen for Context Menu Camera Toggle
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onToggleCameraControl) {
      const cleanup = window.electronAPI.onToggleCameraControl(() => {
        setCameraControlMode(prev => !prev);
      });
      return cleanup;
    }
  }, []);

  // --- Avatar Mode Logic ---
  useEffect(() => {
    if (isAvatarMode) {
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';

      // Fetch initial state
      if (window.electronAPI) {
        window.electronAPI.getAvatarState().then((state: any) => {
          if (state) {
            // Runtime
            // if (state.isSpeaking !== undefined) setIsSpeaking(state.isSpeaking); // Hook manages isSpeaking
            // We cannot SET isSpeaking to hook. But avatar mode is read-only for logic mostly.
            // Actually, isSpeaking comes from TTS.
            // If Avatar Mode, we might receive "isSpeaking" from Main Window via IPC?
            // Line 239 `setIsSpeaking(state.isSpeaking)`.
            // `useTTS` doesn't support setting isSpeaking.
            // BUT, Avatar Mode doesn't run TTS. It just VISUALIZES it.
            // So `isSpeaking` SHOULD be a state in App.tsx for Avatar Mode?
            // Or we rely on `useTTS`?
            // `useTTS` is NOT synced across windows.
            // So in Avatar Mode, `useTTS` is idle.
            // We need `isSpeaking` state variable to drive the avatar.
            // COMPLICATION: `isSpeaking` is constant from `useTTS` in Main Window.
            // In Avatar Window, `useTTS` is not driving.
            // So I DO need a local `isSpeaking` state for Avatar Mode?
            // OR I alias `isSpeaking` to a state that is updated via IPC.

            // I will create a `remoteIsSpeaking` state for Avatar Mode?
            // Or simpler: `const isSpeaking = isAvatarMode ? remoteIsSpeaking : isTTSSpeaking;`
          }
        }).catch(console.error);
      }
    }
  }, [isAvatarMode, avatarPath]);

  // Handle Avatar Mode Remote State
  const [remoteIsSpeaking, setRemoteIsSpeaking] = useState(false);
  const [remoteIsThinking, setRemoteIsThinking] = useState(false);
  const [remoteIsSleeping, setRemoteIsSleeping] = useState(false);

  // Derived State for Renderer
  const effectiveIsSpeaking = isAvatarMode ? remoteIsSpeaking : isTTSSpeaking;
  const effectiveIsThinking = isAvatarMode ? remoteIsThinking : isThinking;
  const effectiveIsSleeping = isAvatarMode ? remoteIsSleeping : isSleeping;

  // Sync state to Avatar Window (Only if Main Window)
  // Sync state to Avatar Window (Only if Main Window)
  useEffect(() => {
    if (!isAvatarMode && window.electronAPI && window.electronAPI.updateAvatarState) {
      window.electronAPI.updateAvatarState({
        path: avatarPath,
        visible: settingAvatarVisible,
        scale: avatarScale,
        isSpeaking: isTTSSpeaking,
        isThinking: isThinking,
        isSleeping: isSleeping,
        sleepTimeout: sleepTimeout,
        autoBlink: autoBlink,
        developerMode: developerMode,
        currentAvatarId: currentAvatarId
      });
    }
  }, [avatarPath, settingAvatarVisible, avatarScale, isTTSSpeaking, isThinking, isSleeping, isAvatarMode, sleepTimeout, autoBlink, developerMode, currentAvatarId]);


  // Supplementary sync for developerMode
  // Supplementary sync for developerMode
  useEffect(() => {
    if (!isAvatarMode && window.electronAPI && window.electronAPI.updateAvatarState) {
      window.electronAPI.updateAvatarState({
        path: avatarPath,
        visible: settingAvatarVisible,
        scale: avatarScale,
        isSpeaking: isTTSSpeaking,
        isThinking: isThinking,
        developerMode: developerMode
      });
    }
  }, [developerMode, isAvatarMode, avatarPath, settingAvatarVisible, avatarScale, isTTSSpeaking, isThinking, isSleeping, alwaysOnTop]);


  // Load default avatar if exists (async)
  useEffect(() => {
    const loadDefault = async () => {
      // In dev, we might know the path. In prod, it's harder.
    };
    loadDefault();
  }, []);

  // Settings Load Side Effects
  useEffect(() => {
    if (settingsLoaded) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      aiService.updateSettings(settings);
      if (settings.avatarPath) loadAvatar(settings.avatarPath);
      if (settings.avatarPath) loadAvatar(settings.avatarPath);
      if (settingAvatarScale !== undefined) setAvatarScale(settingAvatarScale);
      if (settings.skinId && window.electronAPI && window.electronAPI.loadSkin) window.electronAPI.loadSkin(settings.skinId);
    }
  }, [settingsLoaded]);

  // Initial Load (History, Version, Logs)
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getLogDirectory().then(dir => updateSettings({ logDirectory: dir }));
      window.electronAPI.getAppVersion().then(setAppVersion);
      window.electronAPI.getHistory().then(initialHistory => {
        if (initialHistory && initialHistory.length > 0) {
          const uniqueHistory = Array.from(new Map(initialHistory.map((item: any) => [item.id, item])).values());
          const migratedHistory = uniqueHistory.map((item: any) => ({
            ...item,
            category: item.category || (item.type === 'clipboard' ? 'clipboard' : 'chat')
          }));
          setHistory(migratedHistory as HistoryItem[]);
        }
      });
    }
  }, []);

  // Clipboard Listener
  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onClipboardUpdated((newItem) => {
        if (!isClipboardEnabledRef.current) return;

        setHistory(prev => {
          if (prev.some(p => p.id === newItem.id || (p.content === newItem.content && p.type === 'clipboard'))) {
            return prev;
          }
          const itemWithCategory: HistoryItem = {
            ...newItem,
            category: 'clipboard',
            id: newItem.id || (Date.now().toString() + Math.random().toString(36).substring(2, 9))
          };
          handleAutoProcess(itemWithCategory.content);
          return [...prev, itemWithCategory];
        });
      });
      return () => cleanup();
    }
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, activeTab]);

  useEffect(() => {
    if (!isProcessing && activeTab === 'chat' && !showSettings) {
      if (document.hasFocus()) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 10);
      }
    }
  }, [isProcessing, activeTab, showSettings]);

  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onFocusInput(() => {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      });
      return cleanup;
    }
  }, []);

  const handleAutoProcess = async (text: string) => {
    if (!text.trim()) return;

    const urlRegex = /^(http|https):\/\/[^ "]+$/;
    if (urlRegex.test(text)) {
      try {
        if (window.electronAPI) {
          const metadata = await window.electronAPI.fetchUrlMetadata(text);
          const content = `[URL] ${text}\n${metadata.title ? `Title: ${metadata.title}` : ''}${metadata.description ? `\nDescription: ${metadata.description}` : ''}`;
          const responseItem: HistoryItem = {
            id: Date.now().toString(),
            type: 'system',
            content: content.trim(),
            timestamp: new Date().toISOString(),
            category: 'clipboard'
          };
          setHistory(prev => [...prev, responseItem]);
          if (window.electronAPI) {
            window.electronAPI.addHistory(responseItem);
          }
        }
      } catch (error) {
        console.error("Failed to fetch URL metadata:", error);
      }
      return;
    }

    // Auto check if we should translate
    const effectiveKey = provider === 'gemini' ? (geminiApiKey || apiKey) : (provider === 'openai' ? openaiApiKey : 'local');
    if (!aiService.hasKey() && provider !== 'local' && !effectiveKey) {
      return;
    }

    try {
      const smartTranslatePrompt = `
You are a translator.
Target Language: ${targetLanguage}
Input: "${text}"
Instruction: If the input is already in ${targetLanguage}, output "NO_TRANSLATION_NEEDED". Otherwise, translate it to ${targetLanguage}.
`;
      const result = await aiService.generateText(smartTranslatePrompt);

      if (!result.includes("NO_TRANSLATION_NEEDED")) {
        const responseItem: HistoryItem = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          type: 'response',
          content: `Translated: ${result}`,
          timestamp: new Date().toISOString(),
          category: 'clipboard'
        };
        setHistory(prev => [...prev, responseItem]);
      }
    } catch (error: any) {
      console.error("Auto-translation failed:", error);
    }
  };


  // --- Idle / Sleep Timer Logic ---
  const resetIdleTimer = () => {
    setIsSleeping(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sleepTimeout > 0 && !isSpeaking && !isThinking) {
      idleTimerRef.current = setTimeout(() => {
        setIsSleeping(true);
      }, sleepTimeout);
    }
  };

  useEffect(() => {
    // Activity Reset Handler
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isSleeping) {
        setIsSleeping(false);
      }
    };

    // Attach listeners
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('wheel', handleActivity);

    // Timer Loop
    const interval = setInterval(() => {
      if (sleepTimeout > 0) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed > sleepTimeout && !isSleeping) {
          // Check if we are interacting
          if (!effectiveIsSpeaking && !effectiveIsThinking && !isRecording) {
            setIsSleeping(true);
          } else {
            lastActivityRef.current = Date.now();
          }
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      clearInterval(interval);
    };
  }, [sleepTimeout, isSleeping, effectiveIsSpeaking, effectiveIsThinking, isRecording]);

  useEffect(() => {
    // Events to reset idle
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    // Reset on state changes
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [sleepTimeout, effectiveIsSpeaking, effectiveIsThinking]);

  // --- Avatar Mode Logic (Effects) ---
  useEffect(() => {
    if (isAvatarMode && window.electronAPI && window.electronAPI.onAvatarStateUpdate) {
      const removeListener = window.electronAPI.onAvatarStateUpdate((state: any) => {
        // Runtime
        if (state.isSpeaking !== undefined) setRemoteIsSpeaking(state.isSpeaking);
        if (state.isThinking !== undefined) setRemoteIsThinking(state.isThinking);
        if (state.isSleeping !== undefined) setRemoteIsSleeping(state.isSleeping);

        // Settings Sync
        const updates: any = {};
        if (state.path) updates.avatarPath = state.path;
        if (state.visible !== undefined) updates.avatarVisible = state.visible;
        if (state.scale !== undefined) updates.avatarScale = state.scale;

        if (state.developerMode !== undefined) updates.developerMode = state.developerMode;
        if (state.sleepTimeout !== undefined) updates.sleepTimeout = state.sleepTimeout;
        if (state.autoBlink !== undefined) updates.autoBlink = state.autoBlink;
        if (state.currentAvatarId !== undefined) updates.currentAvatarId = state.currentAvatarId;

        if (Object.keys(updates).length > 0) {
          handleSettingsUpdate(updates);
        }
      });

      return removeListener;
    } else {
      // Main Window Listener for Avatar Scale Sync
      if (window.electronAPI && window.electronAPI.onAvatarScaleSync) {
        const removeScaleListener = window.electronAPI.onAvatarScaleSync((newScale: number) => {
          handleSettingsUpdate({ avatarScale: newScale });
        });
        return removeScaleListener;
      }
    }
  }, [isAvatarMode]);


  // Update Window Size on Scale Change
  useEffect(() => {
    if (isAvatarMode && imageDimensions.width > 0 && window.electronAPI && window.electronAPI.resizeAvatarWindow) {
      window.electronAPI.resizeAvatarWindow(imageDimensions.width * avatarScale, imageDimensions.height * avatarScale);
    }
  }, [avatarScale, imageDimensions, isAvatarMode]);


  // Manage click-through for Avatar Window
  useEffect(() => {
    if (isAvatarMode && window.electronAPI && window.electronAPI.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  }, [isAvatarMode]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDelete = (id: string) => {
    setHistory(prev => prev.map(item => item.id === id ? { ...item, isMasked: !item.isMasked } : item));
  };

  const handleRetry = (text: string) => {
    setInputText(text);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleToggleClipboard = async () => {
    const newState = !isClipboardEnabled;
    updateSettings({ isClipboardEnabled: newState });
    if (window.electronAPI) {
      await window.electronAPI.toggleClipboard(newState);
    }
  };

  const handleSummarize = async (text: string) => {
    // Basic summarization execution
    // Probably should be moved to Hook, but keeping here for simplicity as it's UI triggered
    // We can reuse aiService directly, but we need locking?
    // useAIConversation handles processing state?
    // We can manually set lock via hook? No.
    // We'll just run it parallel or use logic
    // Actually we can use aiService directly.

    try {
      // We can't set "isProcessing" on hook from here easily without exposing setter.
      // But we DO have `sendMessage` which drives the whole chat?
      // No, this is "Summarize this specific text".
      // Let's just use aiService and assume UI handles async nicely.
      // Or adding a "Summarize" method to useAIConversation would be better.
      // But for now:
      const prompt = `
You are a summarizer.
Target Language: ${targetLanguage}
Input Text:
"${text}"

Instruction: Summarize the input text concisely in ${targetLanguage}.
`;
      // We lack "setIsProcessing" exposed from hook.
      // It's okay, maybe just fire and forget or let user know.
      const summary = await aiService.generateText(prompt);
      const responseItem: HistoryItem = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        type: 'response',
        content: `Summary:\n${summary}`,
        timestamp: new Date().toISOString(),
        category: 'chat'
      };
      setHistory(prev => [...prev, responseItem]);
    } catch (e) {
      console.error(e);
    }
  };


  const settingsObj = {
    apiKey, geminiApiKey, geminiModelName, groqApiKey, openaiApiKey, isClipboardEnabled, themeColor, provider, localBaseUrl, localModelName, openaiBaseUrl, openaiModelName, targetLanguage, skinId, logDirectory, systemPrompt, additionalPrompt,
    ttsEnabled, ttsProvider, ttsVoice, ttsSummaryPrompt, ttsSummaryThreshold,
    inputDeviceId, wakeWord, voiceInputEnabled, transcriptionProvider, wakeWordTimeout, developerMode,
    avatarVisible: settingAvatarVisible, avatarScale, avatarPosition, avatarData, currentAvatarId,
    sleepTimeout, alwaysOnTop, autoBlink
  };

  // Debug State
  const [debugPattern, setDebugPattern] = useState<string | null>(null);


  // If Avatar Mode, Render ONLY Avatar (Short-circuit return)
  if (isAvatarMode) {
    console.log('[App] Render Avatar Mode. Visible:', settingAvatarVisible, 'VRMConfig:', JSON.stringify(settings.vrmConfigs?.[currentAvatarId || '']));
    return (
      <div
        className={`pointer-events-auto no-drag`}
        style={{
          background: 'transparent',
          width: '100%',
          height: '100%',
          overflow: 'visible'
        } as any}
      >
        {settingAvatarVisible && avatarData && (
          <div className="relative">
            <AvatarRenderer
              key={currentAvatarId || 'default'}
              avatarData={avatarData}
              avatarId={currentAvatarId || undefined}
              isSpeaking={effectiveIsSpeaking}
              isThinking={effectiveIsThinking}
              isSleeping={effectiveIsSleeping}
              scale={avatarScale}
              position={{ x: 0, y: 0 }}
              visible={settingAvatarVisible}
              draggableWindow={false}
              onDragDelta={(dx, dy) => {
                if (window.electronAPI && window.electronAPI.moveAvatarWindow) {
                  window.electronAPI.moveAvatarWindow(dx, dy);
                }
              }}
              developerMode={developerMode}
              controlsEnabled={cameraControlMode}
              debugPattern={debugPattern}
              vrmAmbientLightIntensity={(() => {
                const val = (currentAvatarId && settings.vrmConfigs && settings.vrmConfigs[currentAvatarId]?.ambientLightIntensity) ?? settings.vrmAmbientLightIntensity ?? 1.0;
                console.log('[App] VRM Light:', val, 'ID:', currentAvatarId);
                return val;
              })()}
              vrmIdleAnimationPath={(() => {
                const val = (currentAvatarId && settings.vrmConfigs && settings.vrmConfigs[currentAvatarId]?.idleAnimationPath) ?? settings.vrmIdleAnimationPath;
                console.log('[App] VRM Anim:', val);
                return val;
              })()}
              vrmHdriPath={(() => {
                const val = (currentAvatarId && settings.vrmConfigs && settings.vrmConfigs[currentAvatarId]?.hdriPath) || undefined;
                return val || undefined;
              })()}
              vrmHdriIntensity={(() => {
                const val = (currentAvatarId && settings.vrmConfigs && settings.vrmConfigs[currentAvatarId]?.hdriIntensity) ?? 1.0;
                return val;
              })()}
              onImageLoaded={(dims) => {
                setImageDimensions(dims);
                const currentIdentifier = currentAvatarId || avatarPath;

                if (currentIdentifier && currentIdentifier !== lastAutoScaledPath.current) {
                  const targetHeight = 500;
                  if (dims.height > targetHeight) {
                    const newScale = parseFloat((targetHeight / dims.height).toFixed(2));
                    setAvatarScale(newScale);
                    if (window.electronAPI && window.electronAPI.syncAvatarScale) window.electronAPI.syncAvatarScale(newScale);
                  } else {
                    setAvatarScale(1.0);
                    if (window.electronAPI && window.electronAPI.syncAvatarScale) window.electronAPI.syncAvatarScale(1.0);
                  }
                  lastAutoScaledPath.current = currentIdentifier;
                }

                const currentScale = (currentIdentifier && currentIdentifier !== lastAutoScaledPath.current) ?
                  (dims.height > 500 ? parseFloat((500 / dims.height).toFixed(2)) : 1.0)
                  : avatarScale;

                const minW = 300;
                const minH = 300;

                const finalW = Math.max(minW, Math.ceil(dims.width * currentScale));
                const finalH = Math.max(minH, Math.ceil(dims.height * currentScale));

                if (window.electronAPI && window.electronAPI.resizeAvatarWindow) {
                  window.electronAPI.resizeAvatarWindow(finalW, finalH);
                }
              }}
              onPositionChange={() => { }}
              onActivity={resetIdleTimer}
              autoBlink={autoBlink}
            />

            {/* Avatar Mode Overlay for Sleep/Hide */}
            {isAvatarMode && (
              <div
                className={`fixed top-0 left-0 w-full h-full flex items-center justify-center transition-all duration-300 pointer-events-none ${isSleeping ? 'opacity-80 grayscale' : ''}`}
                style={{
                  WebkitAppRegion: 'no-drag',
                } as any}
              >
              </div>
            )}

            {/* Camera Control Button (VRM, DevMode) */}
            {(cameraControlMode || developerMode) && (
              <div
                className="fixed top-16 right-2 z-[99999] pointer-events-auto"
                style={{ WebkitAppRegion: 'no-drag' } as any}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCameraControlMode(prev => !prev);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`px-2 py-1 text-xs font-bold rounded shadow border border-white/20 cursor-pointer ${cameraControlMode ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {cameraControlMode ? '📷 Cam Control: ON (Esc to Exit)' : '📷 Cam Control: OFF'}
                </button>
              </div>
            )}

            {developerMode && avatarData && 'mapping' in avatarData && (avatarData as any).mapping && (
              <div
                className="absolute top-0 left-0 bg-black/30 text-white text-[10px] p-2 rounded pointer-events-auto max-h-[80vh] overflow-y-auto z-50 m-2 custom-scrollbar border border-white/10"
                style={{ WebkitAppRegion: 'no-drag' } as any}
              >
                <div className="font-bold mb-2 pb-1 border-b border-white/20">Debug: Patterns</div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-1 rounded">
                    <input
                      type="radio"
                      name="pattern"
                      checked={debugPattern === null}
                      onChange={() => setDebugPattern(null)}
                      className="accent-blue-500"
                    />
                    <span className={debugPattern === null ? 'text-blue-400' : 'text-white/70'}>AUTO (Default)</span>
                  </label>
                  {Object.keys(avatarData.mapping).map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-white/10 p-1 rounded">
                      <input
                        type="radio"
                        name="pattern"
                        checked={debugPattern === key}
                        onChange={() => setDebugPattern(key)}
                        className="accent-blue-500"
                      />
                      <span className={debugPattern === key ? 'text-blue-400' : 'text-white/70'}>{key}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen text-white overflow-hidden flex flex-col font-sans`} style={{ background: `linear-gradient(to bottom right, ${themeColor || '#ef4444'}, #000000)` }}>
      <Header
        onMinimize={() => window.electronAPI?.minimizeWindow()}
        onClose={() => window.electronAPI?.closeWindow()}
      />

      <div className="flex items-center justify-between px-4 py-1 bg-black/10 backdrop-blur-sm border-b border-white/5 gap-2">
        <DateDisplay />
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            className="p-1 hover:bg-white/10 rounded text-[10px] text-white/50 hover:text-white transition-colors uppercase tracking-wider"
            title="Clear History"
          >
            CLEAR LOG
          </button>
          <div className="w-px h-3 bg-white/10"></div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <HistoryList
          history={history}
          activeTab={activeTab}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onRetry={handleRetry}
          onSummarize={handleSummarize}
        />

        <InputArea
          inputText={inputText}
          setInputText={setInputText}
          isProcessing={isProcessing}
          isSummarizing={isSummarizing}
          onExecute={() => handleExecute()}
          inputRef={inputRef}
          onStop={handleStop}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isClipboardEnabled={isClipboardEnabled}
          onToggleClipboard={handleToggleClipboard}
          isConversationMode={isConversationMode}
          setIsConversationMode={setIsConversationMode}
          onStopTTS={stopSpeaking}
          isSpeaking={isSpeaking}
          onMicClick={handleMicClick}
          isWakeWordActive={isWakeWordActive}
          isRecording={isRecording}
        />
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          settings={settingsObj}
          onSettingsChange={handleSettingsChange}
          appVersion={appVersion}
          onSelectAvatar={switchInstalledAvatar}
        />
      )}
    </div>
  )
}

export default App
