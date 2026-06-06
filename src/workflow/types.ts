export interface GoogleGenAIChunk {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface OpenRouterChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  usage?: OpenRouterUsage;
}
