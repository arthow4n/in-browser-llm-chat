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
      content?: string | null;
    };
  }>;
  usage?: OpenRouterUsage;
}

export type GraphMessageMetadata = {
  tool_calls?: { id: string; name: string; args?: unknown }[];
  [key: string]: unknown;
};

export type GraphMessage = {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  type?: "text" | "tool_call" | "tool_result" | "reasoning";
  name?: string;
  toolCallId?: string;
  metadata?: GraphMessageMetadata;
  createdAt?: number;
  isInjected?: boolean;
};

export interface CompiledPayloadMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  isInjected?: boolean;
  tool_calls?: unknown[];
}

export interface RunnerInterrupt {
  type: string;
  [key: string]: unknown;
}
