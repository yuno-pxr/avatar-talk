import { useState, useRef, useEffect, useCallback } from 'react';
import type { AppSettings } from './useSettings';
import { aiService } from '../services/aiService';

interface UseTTSProps {
    settings: AppSettings;
}

export const useTTS = ({ settings }: UseTTSProps) => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Refs for accessing latest settings without re-creating functions
    const ttsEnabledRef = useRef(settings.ttsEnabled);
    const ttsProviderRef = useRef(settings.ttsProvider);
    const ttsVoiceRef = useRef(settings.ttsVoice);
    const ttsSummaryPromptRef = useRef(settings.ttsSummaryPrompt);
    const ttsSummaryThresholdRef = useRef(settings.ttsSummaryThreshold);

    useEffect(() => {
        ttsEnabledRef.current = settings.ttsEnabled;
        ttsProviderRef.current = settings.ttsProvider;
        ttsVoiceRef.current = settings.ttsVoice;
        ttsSummaryPromptRef.current = settings.ttsSummaryPrompt;
        ttsSummaryThresholdRef.current = settings.ttsSummaryThreshold;
    }, [settings]);

    const stopSpeaking = useCallback(() => {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, []);

    const speak = useCallback(async (text: string) => {
        // console.log(`speakText called. Enabled: ${ttsEnabledRef.current}, Provider: ${ttsProviderRef.current}, Text=${text.substring(0, 50)}...`);

        if (!ttsEnabledRef.current) {
            // console.log("TTS Disabled.");
            return;
        }

        // Stop previous
        stopSpeaking();

        // 1. Check length & Summarize
        let textToSpeak = text;
        if (text.length > (ttsSummaryThresholdRef.current || 200) && ttsSummaryPromptRef.current) {
            try {
                setIsSummarizing(true);
                // console.log("Response too long for TTS, summarizing...");
                const summary = await aiService.chat(
                    [{ role: 'user', content: `${ttsSummaryPromptRef.current}\n\n${text}` }],
                    undefined // AbortSignal
                );
                // console.log("Summary for TTS:", summary);
                if (summary) {
                    textToSpeak = summary;
                    if (window.electronAPI) window.electronAPI.log(`TTS: Summary generated: ${textToSpeak}`);
                }
            } catch (e) {
                console.error("Failed to summarize for TTS:", e);
                // Fallback to original
            } finally {
                setIsSummarizing(false);
            }
        }

        setIsSpeaking(true);

        if (ttsProviderRef.current === 'browser') {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            // Optional: Voice selection logic if needed
            // const voices = window.speechSynthesis.getVoices();
            // ...

            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
        } else if (ttsProviderRef.current === 'voicevox') {
            try {
                const speakerId = ttsVoiceRef.current || '1';

                // 1. Audio Query
                const queryRes = await fetch(`http://localhost:50021/audio_query?speaker=${speakerId}&text=${encodeURIComponent(textToSpeak)}`, {
                    method: 'POST'
                });
                if (!queryRes.ok) throw new Error("VoiceVox Query Failed");
                const queryJson = await queryRes.json();

                // 2. Synthesis
                const synthesisRes = await fetch(`http://localhost:50021/synthesis?speaker=${speakerId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(queryJson)
                });
                if (!synthesisRes.ok) throw new Error("VoiceVox Synthesis Failed");

                const arrayBuffer = await synthesisRes.arrayBuffer();
                const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
                const url = URL.createObjectURL(blob);

                const audio = new Audio(url);
                audio.onended = () => {
                    setIsSpeaking(false);
                    URL.revokeObjectURL(url);
                };
                audio.onerror = (e) => {
                    console.error("Audio playback error", e);
                    setIsSpeaking(false);
                };
                audio.play();

            } catch (e: any) {
                console.error("VoiceVox Error:", e);
                if (window.electronAPI) window.electronAPI.log(`VoiceVox Error: ${e.message}`);
                setIsSpeaking(false);
            }
        } else {
            // Other providers or disabled
            setIsSpeaking(false);
        }
    }, [stopSpeaking]);

    return {
        isSpeaking,
        isSummarizing,
        speak,
        cancel: stopSpeaking
    };
};
