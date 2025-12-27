import { useRef } from 'react';
import { StopCircle, Send, Mic } from 'lucide-react';
import { useSkin } from '../contexts/SkinContext';
import { SkinAnimation } from './SkinAnimation';
import { RiveWaiting } from './RiveWaiting';

interface InputAreaProps {
    inputText: string;
    setInputText: (text: string) => void;
    onExecute: () => void;
    isProcessing: boolean;
    onStop: () => void;
    activeTab: 'chat' | 'clipboard' | 'transcription';
    setActiveTab: (tab: 'chat' | 'clipboard' | 'transcription') => void;
    isClipboardEnabled: boolean;
    onToggleClipboard: () => void;
    isConversationMode: boolean;
    setIsConversationMode: (mode: boolean) => void;
    onStopTTS?: () => void;
    isSpeaking?: boolean;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    onMicClick?: () => void;
    isWakeWordActive?: boolean;
    isRecording?: boolean;
    isSummarizing?: boolean;
}

export const InputArea = ({
    inputText,
    setInputText,
    onExecute,
    isProcessing,
    isSummarizing = false,
    onStop,
    activeTab,
    setActiveTab,
    isClipboardEnabled,
    onToggleClipboard,
    isConversationMode,
    setIsConversationMode,
    onStopTTS,
    isSpeaking = false,
    inputRef: externalRef,
    onMicClick,
    isWakeWordActive = false,
    isRecording = false
}: InputAreaProps) => {
    const { getComponentConfig } = useSkin();
    const config = getComponentConfig('input_area');
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (externalRef || internalRef) as React.RefObject<HTMLInputElement>;


    return (
        <div className="p-4 bg-black/20 backdrop-blur-sm border-t border-white/10" style={config.containerStyle}>
            {/* Tabs */}
            <div className="flex justify-between items-end mb-2 border-b border-white/10 pb-1">
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`text-xs font-bold uppercase tracking-wider pb-1 transition-colors ${activeTab === 'chat' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/70'}`}
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setActiveTab('clipboard')}
                        className={`text-xs font-bold uppercase tracking-wider pb-1 transition-colors ${activeTab === 'clipboard' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/70'}`}
                    >
                        Clipboard
                    </button>
                    <button
                        onClick={() => setActiveTab('transcription')}
                        className={`text-xs font-bold uppercase tracking-wider pb-1 transition-colors ${activeTab === 'transcription' ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white/70'}`}
                    >
                        Transcription
                    </button>
                </div>

                {activeTab === 'chat' && (
                    <label className="flex items-center gap-2 cursor-pointer group pb-1" title="Conversation Mode (Send History)">
                        <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${isConversationMode ? 'bg-blue-500/50' : 'bg-white/10 group-hover:bg-white/20'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isConversationMode ? 'left-4.5' : 'left-0.5'}`} />
                        </div>
                        <input type="checkbox" checked={isConversationMode} onChange={() => setIsConversationMode(!isConversationMode)} className="hidden" />
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isConversationMode ? 'text-blue-200' : 'text-white/30'}`}>Context</span>
                    </label>
                )}
            </div>

            {activeTab === 'chat' && (
                <div className="relative">
                    {/* Input container with conditional overlay */}
                    <div className="relative w-full">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    onExecute();
                                }
                            }}
                            disabled={isProcessing || isSummarizing}
                            placeholder={config.placeholder ?? "Type a command..."}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={config.inputStyle}
                        />

                        {/* Rive Waiting Overlay - Only show when processing or summarizing */}
                        {(isProcessing || isSummarizing) && (
                            <div className="absolute inset-0 bg-black/80 rounded-lg flex items-center justify-center z-10 overflow-hidden pointer-events-none">
                                <div className="w-full h-full opacity-80">
                                    <RiveWaiting />
                                </div>
                                <span className="absolute text-xs font-bold tracking-widest text-white/50 animate-pulse">
                                    {isSummarizing ? 'SUMMARIZING...' : 'PROCESSING'}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-2 right-2 flex gap-2 z-20">
                        {isProcessing ? (
                            <button
                                onClick={onStop}
                                className="p-1 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded transition-colors"
                                title="Stop Generation"
                            >
                                <StopCircle size={16} />
                            </button>
                        ) : (
                            <div className="flex gap-1">
                                {onStopTTS && isSpeaking && (
                                    <button
                                        onClick={onStopTTS}
                                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-white/10 rounded transition-colors"
                                        title="Stop Speaking"
                                    >
                                        <div className="w-3 h-3 bg-current rounded-sm" />
                                    </button>
                                )}
                                {/* Mic Button */}
                                {onMicClick && (
                                    <button
                                        onClick={onMicClick}
                                        className={`p-1 rounded transition-all duration-300 ${isWakeWordActive
                                            ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-110'
                                            : isRecording
                                                ? 'bg-red-500 text-white animate-pulse'
                                                : 'hover:bg-white/10 text-white/70 hover:text-white'
                                            }`}
                                        title={isRecording ? "Stop Voice Input" : "Start Voice Input"}
                                    >
                                        <Mic size={16} className={isWakeWordActive ? 'animate-bounce' : ''} />
                                    </button>
                                )}
                                <button
                                    onClick={onExecute}
                                    disabled={!inputText.trim() || isProcessing}
                                    className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-30 flex items-center gap-1"
                                    style={config.submitButtonStyle}
                                >
                                    {config.submitIcon ? (
                                        <SkinAnimation animationKey={config.submitIcon} className="w-4 h-4" fallback={<span>SEND</span>} />
                                    ) : (
                                        <Send size={16} className="text-blue-400" />
                                    )}
                                    {config.submitLabel && <span className="text-xs font-bold">{config.submitLabel}</span>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'clipboard' && (
                <div className="h-20 flex items-center justify-center bg-white/5 rounded border border-white/10">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${isClipboardEnabled ? 'bg-green-500/50' : 'bg-white/10 group-hover:bg-white/20'}`}>
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isClipboardEnabled ? 'left-6' : 'left-1'}`} />
                        </div>
                        <input
                            type="checkbox"
                            checked={isClipboardEnabled}
                            onChange={onToggleClipboard}
                            className="hidden"
                        />
                        <span className={`text-xs font-mono transition-colors ${isClipboardEnabled ? 'text-green-200' : 'text-white/50'}`}>
                            {isClipboardEnabled ? 'MONITORING ACTIVE' : 'MONITORING PAUSED'}
                        </span>
                    </label>
                </div>
            )}
        </div>
    );
};
