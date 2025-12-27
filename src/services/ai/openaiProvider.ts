import type { AIProvider, Message } from "./types";

export class OpenAIProvider implements AIProvider {
    private baseUrl: string = "https://api.openai.com/v1";
    private apiKey: string = "";
    private modelName: string = "gpt-5.2";

    constructor(apiKey?: string, baseUrl?: string, modelName?: string) {
        if (apiKey) this.apiKey = apiKey;
        if (baseUrl) this.baseUrl = baseUrl;
        if (modelName) this.modelName = modelName;
    }

    updateApiKey(key: string) {
        this.apiKey = key;
    }

    updateSettings(settings: any) {
        if (settings.apiKey) this.apiKey = settings.apiKey;
        if (settings.baseUrl) this.baseUrl = settings.baseUrl;
        if (settings.modelName) this.modelName = settings.modelName;
    }

    hasKey(): boolean {
        return !!this.apiKey;
    }

    async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
        if (!this.apiKey) {
            throw new Error("API Key not set for OpenAI/Grok provider.");
        }

        try {
            // Map messages to OpenAI format if needed (interface matches well normally)
            const openAIMessages = messages.map(m => ({
                role: m.role === 'model' ? 'assistant' : m.role, // OpenAI uses 'assistant'
                content: m.content
            }));

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: openAIMessages,
                    stream: false
                }),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI/Grok API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || "";

        } catch (error: any) {
            if (signal?.aborted) {
                throw new Error("Request cancelled by user");
            }
            throw error;
        }
    }

    async generateText(prompt: string, signal?: AbortSignal): Promise<string> {
        if (!this.apiKey) {
            throw new Error("API Key not set for OpenAI/Grok provider.");
        }

        const plainTextPrompt = `${prompt}\n\nIMPORTANT: Output the response in plain text only. Do NOT use Markdown formatting.`;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [
                        { role: "system", content: "You are a helpful assistant. Output plain text only." },
                        { role: "user", content: plainTextPrompt }
                    ],
                    stream: false
                }),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI/Grok API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || "";

        } catch (error: any) {
            if (signal?.aborted) {
                throw new Error("Request cancelled by user");
            }
            throw error;
        }
    }

    async translateToJapanese(text: string, signal?: AbortSignal): Promise<string> {
        const prompt = `Translate the following text to natural Japanese. Output ONLY the translation.\n\nText: ${text}`;
        return this.generateText(prompt, signal);
    }

    async answerQuestion(question: string, signal?: AbortSignal): Promise<string> {
        const prompt = `Answer the following question in Japanese. Keep the answer concise and helpful.\n\nQuestion: ${question}`;
        return this.generateText(prompt, signal);
    }

    async transcribeAudio(audioBlob: Blob): Promise<string> {
        if (!this.apiKey) {
            throw new Error("API Key not set for OpenAI provider.");
        }

        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        formData.append("model", "whisper-1");

        // Use base URL but ensure it points to the right place for audio
        // Some proxies might only support chat/completions.
        // We assume standard OpenAI structure or compatible.
        // Standard: https://api.openai.com/v1/audio/transcriptions
        // If this.baseUrl is https://api.openai.com/v1, we append /audio/transcriptions

        let endpoint = `${this.baseUrl.replace(/\/chat\/completions$/, '')}/audio/transcriptions`;
        // Normalize: remove trailing slash
        endpoint = endpoint.replace(/([^:]\/)\/+$/g, '$1'); // Not perfect but simple
        // Actually better:
        // If baseUrl is "https://api.openai.com/v1", then result is "https://api.openai.com/v1/audio/transcriptions".

        // Note: Grok beta might not support audio yet.

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
                // Content-Type is multipart/form-data, browser sets it automatically with boundary when using FormData
            },
            body: formData
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Transcription failed: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.text || "";
    }
}
