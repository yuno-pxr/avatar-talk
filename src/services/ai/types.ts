export interface Message {
    role: 'user' | 'model' | 'system';
    content: string;
}

export interface AIProvider {
    generateText(prompt: string, signal?: AbortSignal): Promise<string>;
    chat(messages: Message[], signal?: AbortSignal): Promise<string>;
    translateToJapanese(text: string, signal?: AbortSignal): Promise<string>;
    answerQuestion(question: string, signal?: AbortSignal): Promise<string>;
    updateApiKey(key: string): void;
    updateSettings?(settings: any): void;
    hasKey(): boolean;
    transcribeAudio(audioBlob: Blob): Promise<string>;
}

export interface AIProviderConfig {
    provider: 'gemini' | 'local' | 'openai' | 'groq';
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
}
