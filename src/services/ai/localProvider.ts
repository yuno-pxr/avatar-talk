import type { AIProvider, Message } from "./types";

export class LocalProvider implements AIProvider {
    private baseUrl: string = "http://localhost:11434/v1"; // Default to Ollama
    private apiKey: string = "sk-dummy"; // Not usually needed for local, but good to have
    private modelName: string = "llama3"; // Default model

    constructor(baseUrl?: string, modelName?: string) {
        if (baseUrl) this.baseUrl = baseUrl;
        if (modelName) this.modelName = modelName;
    }

    updateApiKey(key: string) {
        this.apiKey = key || "sk-dummy";
    }

    updateSettings(settings: any) {
        if (settings.baseUrl) this.baseUrl = settings.baseUrl;
        if (settings.modelName) this.modelName = settings.modelName;
    }

    hasKey(): boolean {
        return true; // Local usually doesn't need a key
    }

    async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
        if ((window as any).electronAPI) {
            (window as any).electronAPI.log(`LocalProvider: Chatting with ${this.modelName} at ${this.baseUrl}`);
        }

        try {
            const localMessages = messages.map(m => ({
                role: m.role === 'model' ? 'assistant' : m.role,
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
                    messages: localMessages,
                    stream: false
                }),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Local API Error: ${response.status} ${response.statusText} - ${errorText}`);
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
        if ((window as any).electronAPI) {
            (window as any).electronAPI.log(`LocalProvider: Generating with ${this.modelName} at ${this.baseUrl}`);
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
                throw new Error(`Local API Error: ${response.status} ${response.statusText} - ${errorText}`);
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

    async transcribeAudio(_audioBlob: Blob): Promise<string> {
        // Placeholder for Local Whisper (e.g. server running at port 9000?)
        throw new Error("Local transcription not yet supported.");
    }
}
