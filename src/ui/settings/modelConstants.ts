export const POPULAR_MODELS = {
  gemini: [
    { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
    { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
    { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
  ],
  openrouter: [
    { label: "Google Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
    { label: "Google Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
    { label: "Llama 3.3 70B Instruct", value: "meta-llama/llama-3.3-70b-instruct" },
    { label: "DeepSeek Chat", value: "deepseek/deepseek-chat" },
  ],
} as const;

export type Provider = keyof typeof POPULAR_MODELS;
