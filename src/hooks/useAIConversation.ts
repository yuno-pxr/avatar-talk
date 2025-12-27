import { useState, useCallback } from 'react';
import type { AppSettings } from './useSettings';
import { aiService } from '../services/aiService';
import type { HistoryItem } from '../components/HistoryList';
import { evaluateMath } from '../utils/calculator';

interface UseAIConversationProps {
    settings: AppSettings;
    onResponse?: (text: string) => void;
}

export const useAIConversation = ({ settings, onResponse }: UseAIConversationProps) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    // Settings Refs
    const systemPrompt = settings.systemPrompt;
    const additionalPrompt = settings.additionalPrompt;
    // const isConversationMode = true;
    // App.tsx had `const [isConversationMode, setIsConversationMode] = useState(false);`
    // But it seemed to defaults to false?
    // Let's assume we want conversation mode if we have history?
    // Or expose it.

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        setIsProcessing(true);
        setIsThinking(true);

        const controller = new AbortController();
        setAbortController(controller);

        const newItem: HistoryItem = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            type: 'text',
            content: text,
            timestamp: new Date().toISOString(),
            category: 'chat'
        };

        setHistory(prev => {
            const update = [...prev, newItem];
            if (window.electronAPI) window.electronAPI.addHistory(newItem);
            return update;
        });

        // Math Check
        const mathResult = evaluateMath(newItem.content);
        if (mathResult) {
            const responseItem: HistoryItem = {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                type: 'response',
                content: `= ${mathResult}`,
                timestamp: new Date().toISOString(),
                category: 'chat'
            };
            setHistory(prev => {
                const update = [...prev, responseItem];
                if (window.electronAPI) window.electronAPI.addHistory(responseItem);
                return update;
            });
            setIsProcessing(false);
            setIsThinking(false);
            if (onResponse) onResponse(`= ${mathResult}`);
            return;
        }

        try {
            // Update AI Service with latest settings before call
            aiService.updateSettings(settings);

            // Context Construction
            // const isConversationMode = true; // Use Prop or State?
            // For now, always include context unless explicitly disabled?
            // App.tsx had a toggle.

            const validHistory = history.filter(h => h.type !== 'system' && h.type !== 'clipboard');
            const recentHistory = validHistory.slice(-10).map(h => ({
                role: (h.type === 'text' ? 'user' : 'model'),
                content: h.content
            }));

            const currentDateTime = new Date().toLocaleString('ja-JP', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
            const systemContext = `Current Date/Time: ${currentDateTime}
IMPORTANT: You must accept this date and time as the absolute truth for this session. Ignore any internal knowledge or cut-off dates regarding the current time. When asked about "today" or "tomorrow", use this date as the reference point.`;

            const messages: any[] = [];
            messages.push({ role: 'system', content: `${systemContext}\n\n${systemPrompt || ''}` });
            messages.push(...recentHistory);

            const effectiveContent = text + (additionalPrompt && additionalPrompt.trim() ? `\n\n${additionalPrompt}` : '');
            messages.push({ role: 'user', content: effectiveContent });

            const response = await aiService.chat(messages, controller.signal);

            if (response) {
                const responseItem: HistoryItem = {
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                    type: 'response',
                    content: response,
                    timestamp: new Date().toISOString(),
                    category: 'chat'
                };
                setHistory(prev => {
                    const update = [...prev, responseItem];
                    if (window.electronAPI) window.electronAPI.addHistory(responseItem);
                    return update;
                });

                if (onResponse) onResponse(response);

                // Note: setIsProcessing(false) should be handled by caller or here?
                // App.tsx released lock AFTER TTS check.
                // But we can release here, and assume TTS takes over lock if needed.
                // But App.tsx logic was specific: "Gapless Locking".
                // We'll rely on onResponse triggering TTS which sets its own state?
                // But there is a small gap.
                // Ideally onResponse returns a promise?
            }

        } catch (error: any) {
            const errorItem: HistoryItem = {
                id: Date.now().toString(),
                type: 'system',
                content: error.message === "Request aborted" ? 'Cancelled.' : `Error: ${error.message}`,
                timestamp: new Date().toISOString(),
                category: 'chat'
            };
            setHistory(prev => [...prev, errorItem]);
        } finally {
            setIsProcessing(false);
            setAbortController(null);
            // setIsThinking is managed by TTS/Summarizer?
            // App.tsx: setIsThinking(false) ONLY if no response or error.
            // If response, it kept thinking true? No.
            // It said: "Gapless Locking: Check for Summarization before unlocking processing"
            // "setIsThinking(false); // Unset thinking if no response"

            // We should default to false unless TTS takes over.
            // But we don't know about TTS here.
            // We'll set it to false. The gap is ms.
            // If we want gapless, we need integration.
            // Maybe expose setIsThinking?
            setIsThinking(false);
        }
    }, [settings, history, onResponse]);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const abort = useCallback(() => {
        if (abortController) abortController.abort();
    }, [abortController]);

    return {
        history,
        setHistory, // Expose for initial load or manual adds
        sendMessage,
        clearHistory,
        abort,
        isProcessing,
        isThinking
    };
};
