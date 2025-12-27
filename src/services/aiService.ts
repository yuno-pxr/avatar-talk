import type { AIProvider, AIProviderConfig, Message } from "./ai/types";
import { GeminiProvider } from "./ai/geminiProvider";
import { LocalProvider } from "./ai/localProvider";
import { OpenAIProvider } from "./ai/openaiProvider";
import { GroqProvider } from "./ai/groqProvider";

export class AIService {
    private provider: AIProvider;
    private config: AIProviderConfig = { provider: 'gemini' };

    constructor() {
        this.provider = new GeminiProvider("");
    }

    initialize(config: AIProviderConfig) {
        this.config = config;
        this.updateProvider();
    }

    private updateProvider() {
        if (this.config.provider === 'local') {
            const local = new LocalProvider(this.config.baseUrl, this.config.modelName);
            this.provider = local;
        } else if (this.config.provider === 'openai') {
            const openai = new OpenAIProvider(this.config.apiKey, this.config.baseUrl, this.config.modelName);
            this.provider = openai;
        } else if (this.config.provider === 'groq') {
            const groq = new GroqProvider(this.config.apiKey || "", this.config.modelName);
            this.provider = groq;
        } else {
            // Gemini
            this.provider = new GeminiProvider(this.config.apiKey || "", this.config.modelName);
        }
    }

    updateSettings(settings: any) {
        // Map flat settings to config
        let baseUrl = settings.localBaseUrl;
        let modelName = settings.localModelName;
        let apiKey = settings.apiKey; // Legacy fallback

        if (settings.provider === 'openai') {
            baseUrl = settings.openaiBaseUrl;
            modelName = settings.openaiModelName;
            if (settings.openaiApiKey) apiKey = settings.openaiApiKey;
        } else if (settings.provider === 'gemini') {
            modelName = settings.geminiModelName || "gemini-3-flash-preview";
            if (settings.geminiApiKey) apiKey = settings.geminiApiKey;
            else if (settings.apiKey) apiKey = settings.apiKey; // Fallback to generic key if gemini specific not set
        } else if (settings.provider === 'groq') {
            // Logic for Groq settings mapping if main provider is Groq
            apiKey = settings.groqApiKey;
            modelName = "llama3-70b-8192";
        }

        this.config = {
            provider: settings.provider || 'gemini',
            apiKey: apiKey,
            baseUrl: baseUrl,
            modelName: modelName
        };
        this.updateProvider();
    }

    // Proxy methods
    hasKey(): boolean {
        return this.provider.hasKey();
    }

    async generateText(prompt: string, signal?: AbortSignal): Promise<string> {
        return this.provider.generateText(prompt, signal);
    }

    async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
        return this.provider.chat(messages, signal);
    }

    async translateToJapanese(text: string, signal?: AbortSignal): Promise<string> {
        return this.provider.translateToJapanese(text, signal);
    }

    async answerQuestion(question: string, signal?: AbortSignal): Promise<string> {
        return this.provider.answerQuestion(question, signal);
    }

    async transcribeAudio(audioBlob: Blob): Promise<string> {
        if (!this.provider.transcribeAudio) {
            throw new Error("Current provider does not support transcription.");
        }
        return this.provider.transcribeAudio(audioBlob);
    }

    // Explicit Groq Transcribe Helper
    async transcribeWithGroq(apiKey: string, audioBlob: Blob): Promise<string> {
        const groq = new GroqProvider(apiKey);
        return groq.transcribeAudio(audioBlob);
    }

    async smartProcess(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
        // Prompt engineering for smart processing
        const prompt = `
You are a helpful AI assistant.
Target Language: ${targetLanguage}

Input: "${text}"

Instructions:
1. Analyze the language of the Input.
2. If the Input is already in ${targetLanguage}:
   - Treat it as a question or command.
   - **ANSWER** the question or **EXECUTE** the command in ${targetLanguage}.
   - Do NOT simply repeat the input.
3. If the Input is NOT in ${targetLanguage}:
   - **TRANSLATE** the Input into ${targetLanguage}.
   - Do NOT answer the question, just provide the translation.
`;
        return this.provider.generateText(prompt, signal);
    }
}

export const aiService = new AIService();
