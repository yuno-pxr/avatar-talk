
import React, { useRef, useEffect } from 'react';
import { Copy, RefreshCw, FileText, Eye, EyeOff } from 'lucide-react';
import { useSkin } from '../contexts/SkinContext';

export interface HistoryItem {
    id: string;
    type: 'text' | 'response' | 'system' | 'clipboard' | 'error';
    content: string;
    timestamp: string;
    category: 'chat' | 'clipboard' | 'transcription';
    isMasked?: boolean;
}

const HistoryItemRow = React.memo(({ item, onCopy, onDelete, onRetry, onSummarize, config }: {
    item: HistoryItem,
    onCopy: (text: string) => void,
    onDelete: (id: string) => void,
    onRetry: (text: string) => void,
    onSummarize: (text: string) => void,
    config: any
}) => {
    return (
        <div
            onClick={() => {
                if (item.type === 'clipboard' && !item.isMasked) {
                    onCopy(item.content);
                }
            }}
            className={`group relative p-3 rounded bg-white/5 border border-white/5 hover:border-white/20 transition-all ${item.type === 'response' ? 'ml-4' : 'mr-4'} ${item.type === 'clipboard' ? 'cursor-pointer hover:bg-white/10 active:scale-[0.98]' : ''}`}
            title={item.type === 'clipboard' ? "Click to Copy" : ""}
            style={config.itemStyle}
        >
            <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold opacity-50 uppercase">{item.type}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] opacity-30 mr-2">{new Date(item.timestamp).toLocaleTimeString()}</span>

                    {/* Summarize (for long text) */}
                    {item.content.length >= 200 && !item.isMasked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSummarize(item.content);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
                            title="Summarize"
                        >
                            <FileText size={10} />
                        </button>
                    )}

                    {/* Retry (only for user text) */}
                    {item.type === 'text' && !item.isMasked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetry(item.content);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
                            title="Retry"
                        >
                            <RefreshCw size={10} />
                        </button>
                    )}

                    {/* Copy */}
                    {!item.isMasked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopy(item.content);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
                            title="Copy to Clipboard"
                        >
                            <Copy size={10} />
                        </button>
                    )}

                    {/* Mask/Hide */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                        }}
                        className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
                        title={item.isMasked ? "Reveal" : "Mask"}
                    >
                        {item.isMasked ? <Eye size={10} /> : <EyeOff size={10} />}
                    </button>
                </div>
            </div>

            <div className={`text-sm leading-relaxed break-all select-text whitespace-pre-wrap ${item.type === 'text' ? 'text-white' : 'text-white/90'}`} style={config.contentStyle}>
                {item.isMasked ? (
                    <span className="text-white/30 italic select-none">********</span>
                ) : (
                    item.content
                )}
            </div>
        </div>
    );
});

interface HistoryListProps {
    history: HistoryItem[];
    activeTab: 'chat' | 'clipboard' | 'transcription';
    onCopy: (text: string) => void;
    onDelete: (id: string) => void;
    onRetry: (text: string) => void;
    onSummarize: (text: string) => void;
}

export const HistoryList = ({ history, activeTab, onCopy, onDelete, onRetry, onSummarize }: HistoryListProps) => {
    const { getComponentConfig } = useSkin();
    const config = getComponentConfig('history_list');
    const historyEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, activeTab]);

    const getHeader = () => {
        if (activeTab === 'chat') return config.chatHeader ?? 'CHAT LOG';
        if (activeTab === 'clipboard') return config.clipboardHeader ?? 'CLIPBOARD LOG';
        return 'TRANSCRIPTION LOG';
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={config.containerStyle}>
            <div className="text-[10px] font-bold text-white/30 mb-2 sticky top-0 bg-transparent backdrop-blur-sm py-1 z-10 w-full text-center tracking-widest">
                {getHeader()}
            </div>

            {history.filter(item => item.category === activeTab).length === 0 && (
                <div className="text-white/30 text-xs italic text-center mt-10">
                    No activity recorded in {activeTab}.
                </div>
            )}

            {history
                .filter(item => item.category === activeTab)
                .map((item) => (
                    <HistoryItemRow
                        key={item.id}
                        item={item}
                        onCopy={onCopy}
                        onDelete={onDelete}
                        onRetry={onRetry}
                        onSummarize={onSummarize}
                        config={config}
                    />
                ))}
            <div ref={historyEndRef} />
        </div>
    );
};
