import { useState, useEffect, useRef, useCallback } from 'react';
import * as Vosk from 'vosk-browser';
import type { AppSettings } from './useSettings';
import { aiService } from '../services/aiService';

interface UseVoiceInputProps {
    settings: AppSettings;
    onTranscriptionComplete: (text: string) => void;
}

export const useVoiceInput = ({ settings, onTranscriptionComplete }: UseVoiceInputProps) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isWakeWordActive, setIsWakeWordActive] = useState(false);

    // Refs
    const voskModelRef = useRef<Vosk.Model | null>(null);
    const voskRecognizerRef = useRef<Vosk.KaldiRecognizer | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const voskLastPartialRef = useRef<string>("");

    // Settings Refs
    const voiceInputEnabled = settings.voiceInputEnabled;
    const inputDeviceId = settings.inputDeviceId;
    const wakeWord = settings.wakeWord;
    const transcriptionProvider = settings.transcriptionProvider;
    const wakeWordTimeout = settings.wakeWordTimeout;
    const targetLanguage = settings.targetLanguage;
    // const provider = settings.transcriptionProvider;

    // Developer Mode for Debug Logs?
    // const developerMode = settings.developerMode;

    // --- Core Logic: Hybrid Listener (For Wake Word Triggered Command) ---
    const startHybridListening = useCallback(async () => {
        try {
            if (window.electronAPI) window.electronAPI.log(`Starting Hybrid Command Listening (Timeout: ${wakeWordTimeout}s)`);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: inputDeviceId && inputDeviceId !== 'default' ? { exact: inputDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            const mediaRecorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                setIsRecording(false);
                setIsWakeWordActive(false);

                const audioBlob = new Blob(chunks, { type: 'audio/wav' });

                try {
                    if (window.electronAPI) window.electronAPI.log("Sending Audio to AI...");

                    let transcript = "";
                    if (transcriptionProvider === 'groq') {
                        if (!settings.groqApiKey) throw new Error("Groq API Key is missing.");
                        transcript = await aiService.transcribeWithGroq(settings.groqApiKey, audioBlob);
                    } else {
                        transcript = await aiService.transcribeAudio(audioBlob);
                    }

                    if (window.electronAPI) window.electronAPI.log(`AI Transcription: ${transcript}`);

                    if (transcript && transcript.trim()) {
                        onTranscriptionComplete(transcript);
                    }
                } catch (e: any) {
                    console.error("Transcription Failed:", e);
                    if (window.electronAPI) window.electronAPI.log(`Transcription Failed: ${e.message}`);
                } finally {
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            mediaRecorder.start();
            setIsRecording(true);

            // VAD Setup
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.5;
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let lastVoiceTimestamp = Date.now();
            let vadInterval: NodeJS.Timeout | null = null;
            const VOICE_THRESHOLD = 30;

            const checkAudioLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const average = sum / dataArray.length;

                if (average > VOICE_THRESHOLD) lastVoiceTimestamp = Date.now();

                const timeSinceVoice = (Date.now() - lastVoiceTimestamp) / 1000;
                if (timeSinceVoice > wakeWordTimeout) {
                    if (mediaRecorder.state === 'recording') {
                        console.log(`Silence detected (${timeSinceVoice.toFixed(1)}s). Stopping.`);
                        mediaRecorder.stop();
                        if (vadInterval) clearInterval(vadInterval);
                        microphone.disconnect();
                        analyser.disconnect();
                        audioContext.close();
                    }
                }
            };

            vadInterval = setInterval(checkAudioLevel, 100);

            // Force stop
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    if (vadInterval) clearInterval(vadInterval);
                    microphone.disconnect();
                    analyser.disconnect();
                    audioContext.close();
                }
            }, 30000);

        } catch (e) {
            console.error("Failed to start hybrid listener", e);
        }
    }, [inputDeviceId, wakeWordTimeout, transcriptionProvider, settings.groqApiKey, onTranscriptionComplete]);


    // --- Core Logic: Vosk Background Listener ---
    useEffect(() => {
        if (!voiceInputEnabled) {
            // Cleanup
            if (voskRecognizerRef.current) {
                try {
                    audioContextRef.current?.close();
                    processorRef.current?.disconnect();
                    sourceRef.current?.disconnect();
                } catch (e) { }
                voskRecognizerRef.current = null;
                audioContextRef.current = null;
                sourceRef.current = null;
                processorRef.current = null;
                if (window.electronAPI) window.electronAPI.log("Vosk Stopped (Background)");
            }
            return;
        }

        const startVosk = async () => {
            try {
                if (window.electronAPI) window.electronAPI.log("Starting Vosk Background Listener...");

                if (!voskModelRef.current) {
                    const modelUrl = "/vosk-models/vosk-model-small-ja-0.22.zip";
                    const model = await Vosk.createModel(modelUrl);
                    voskModelRef.current = model;
                }
                const model = voskModelRef.current;
                if (!model) return;

                if (audioContextRef.current && audioContextRef.current.state !== 'closed') return;

                const audioContext = new AudioContext();
                audioContextRef.current = audioContext;

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputDeviceId && inputDeviceId !== 'default' ? { exact: inputDeviceId } : undefined,
                        echoCancellation: true,
                        noiseSuppression: true,
                        channelCount: 1,
                        sampleRate: 16000
                    }
                });

                const source = audioContext.createMediaStreamSource(stream);
                sourceRef.current = source;

                const recognizer = new model.KaldiRecognizer(audioContext.sampleRate);
                voskRecognizerRef.current = recognizer;

                const checkTrigger = (text: string, source: string) => {
                    const normalizedText = text.toLowerCase().replace(/　/g, ' ').replace(/[、。！？]/g, '');
                    const normalizedWakeWord = wakeWord.toLowerCase().replace(/　/g, ' ').replace(/[、。！？]/g, '');

                    if (normalizedText.includes(normalizedWakeWord)) {
                        if (window.electronAPI) window.electronAPI.log(`[Vosk] Trigger Detected (${source}): "${text}"`);
                        if (!isWakeWordActive) {
                            setIsWakeWordActive(true);
                            startHybridListening();
                        }
                        return true;
                    }
                    return false;
                };

                recognizer.on("result", (message: any) => {
                    const text = message.result.text;
                    if (text) {
                        // Check trigger if background mode (Manual recording logic via handleMicClick overrides this?)
                        // Our manual logic uses `isRecording`.
                        // But `isRecording` state comes from hook state.
                        // Here we don't have access to `isRecording` ref unless we use a ref.
                        // Wait, useEffect clojure trap. `isRecording` is stale here.
                        // Refactor needed: use `isRecordingRef`?
                        // Actually, Manual Mode for Vosk was toggled via handleMicClick which set isRecording=true.
                        // If isRecording is true, we should EXECUTE command instead of check trigger.
                        // But `isRecording` state is managed outside this effect.
                        // We need a ref for `isRecording`.

                        // NOTE: For now, assuming Background is PURELY for Wake Word.
                        // Manual toggles use different flow or we check ref.
                        if (!isRecordingRef.current) {
                            checkTrigger(text, 'final');
                        } else if (transcriptionProvider === 'vosk') {
                            // If manual recording with vosk, we accept result as command
                            if (window.electronAPI) window.electronAPI.log(`[Vosk] Manual Command: "${text}"`);
                            onTranscriptionComplete(text);
                        }
                        voskLastPartialRef.current = "";
                    }
                });

                recognizer.on("partialresult", (message: any) => {
                    const partial = message.result.partial;
                    if (partial) {
                        voskLastPartialRef.current = partial;
                        if (!isRecordingRef.current) {
                            checkTrigger(partial, 'partial');
                        }
                    }
                });

                const processor = audioContext.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;
                processor.onaudioprocess = (event) => {
                    if (audioContext.state === 'suspended') audioContext.resume();
                    try { recognizer.acceptWaveform(event.inputBuffer); } catch (e) { }
                };

                source.connect(processor);
                processor.connect(audioContext.destination);

            } catch (err) {
                console.error("Failed to start Vosk:", err);
            }
        };

        startVosk();

        return () => {
            // Clean up if voice disabled
            if (voskRecognizerRef.current) {
                try {
                    audioContextRef.current?.close();
                    processorRef.current?.disconnect();
                    sourceRef.current?.disconnect();
                } catch (e) { }
                voskRecognizerRef.current = null;
            }
        };
    }, [voiceInputEnabled, inputDeviceId, wakeWord, transcriptionProvider, startHybridListening]);


    // Ref for Stale access inside Vosk callback
    const isRecordingRef = useRef(isRecording);
    useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

    // --- Manual Toggle ---
    const toggleRecording = useCallback(async () => {
        if (transcriptionProvider === 'native') {
            // Native logic
            if (!('webkitSpeechRecognition' in window)) return;
            setIsRecording(true);
            // @ts-ignore
            const recognition = new window.webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = targetLanguage || 'en-US';
            recognition.onresult = (e: any) => {
                const transcript = e.results[0][0].transcript;
                if (e.results[0].isFinal && transcript) {
                    onTranscriptionComplete(transcript);
                }
            };
            recognition.onend = () => setIsRecording(false);
            recognition.start();
        }
        else if (transcriptionProvider === 'vosk') {
            // Vosk Manual Toggle
            const newState = !isRecording;
            if (isRecording && voskLastPartialRef.current && voskLastPartialRef.current.trim()) {
                onTranscriptionComplete(voskLastPartialRef.current.trim());
                voskLastPartialRef.current = "";
            }
            setIsRecording(newState);
        }
        else {
            // OpenAI/Local/Groq (MediaRecorder)
            if (isRecording) {
                mediaRecorderRef.current?.stop();
                setIsRecording(false);
            } else {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: { deviceId: inputDeviceId && inputDeviceId !== 'default' ? { exact: inputDeviceId } : undefined }
                    });
                    const mediaRecorder = new MediaRecorder(stream);
                    mediaRecorderRef.current = mediaRecorder;
                    audioChunksRef.current = [];
                    mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
                    mediaRecorder.onstop = async () => {
                        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                        try {
                            let text = "";
                            if (transcriptionProvider === 'groq') {
                                if (!settings.groqApiKey) throw new Error("Missing Key");
                                text = await aiService.transcribeWithGroq(settings.groqApiKey, blob);
                            } else {
                                text = await aiService.transcribeAudio(blob);
                            }
                            if (text) onTranscriptionComplete(text);
                        } catch (e) { console.error(e); }
                        finally { stream.getTracks().forEach(t => t.stop()); }
                    }
                    mediaRecorder.start();
                    setIsRecording(true);
                } catch (e) { console.error(e); }
            }
        }
    }, [isRecording, inputDeviceId, transcriptionProvider, targetLanguage, settings.groqApiKey, onTranscriptionComplete]);


    return {
        isRecording,
        isWakeWordActive,
        toggleRecording
    };
};
