import type { AIProvider, Message } from "./types";
import OpenAI from "openai";

export class GroqProvider implements AIProvider {
    private client: OpenAI | null = null;
    private modelName: string = "llama3-70b-8192"; // Default text model
    private audioModelName: string = "whisper-large-v3"; // Default audio model


    constructor(apiKey: string, modelName?: string) {
        this.updateApiKey(apiKey);
        if (modelName) this.modelName = modelName;
    }

    updateApiKey(apiKey: string) {

        if (apiKey) {
            this.client = new OpenAI({
                apiKey: apiKey,
                baseURL: "https://api.groq.com/openai/v1",
                dangerouslyAllowBrowser: true
            });
        } else {
            this.client = null;
        }
    }

    hasKey(): boolean {
        return !!this.client;
    }

    // Text Generation (Chat) - Optional if user wants to use Groq for Chat too
    async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
        if (!this.client) throw new Error("Groq API Key not set.");

        const response = await this.client.chat.completions.create({
            model: this.modelName,
            messages: messages.map(m => ({ role: m.role as any, content: m.content })),
        }, { signal });

        return response.choices[0]?.message?.content || "";
    }

    async generateText(prompt: string, signal?: AbortSignal): Promise<string> {
        return this.chat([{ role: 'user', content: prompt }], signal);
    }

    async translateToJapanese(text: string, signal?: AbortSignal): Promise<string> {
        return this.generateText(`Translate to Japanese: ${text}`, signal);
    }

    async answerQuestion(question: string, signal?: AbortSignal): Promise<string> {
        return this.generateText(`Answer in Japanese: ${question}`, signal);
    }

    // Audio Transcription
    async transcribeAudio(audioBlob: Blob): Promise<string> {
        if (!this.client) throw new Error("Groq API Key not set.");

        // Groq / OpenAI API expects a File object
        const file = new File([audioBlob], "audio.wav", { type: "audio/wav" }); // Groq handles wav/webm/etc

        // Note: OpenAI SDK 'transcriptions.create' handles multipart form data automatically
        const response = await this.client.audio.transcriptions.create({
            file: file,
            model: this.audioModelName,
            language: "ja", // Force Japanese for better accuracy if target is Japanese
            response_format: "text" // return plain text
        });

        // The SDK might return string or object depending on response_format.
        // With 'text', it returns string.
        return response as unknown as string;
    }
}
