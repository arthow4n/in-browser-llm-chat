import { createMachine, assign, fromCallback } from "xstate";

export interface StreamingMessageBubbleContext {
  rawText: string;
  debouncedText: string;
  isStreaming: boolean;
}

export type StreamingMessageBubbleEvent =
  | { type: "STREAM_START" }
  | { type: "TOKEN_RECEIVED"; token: string }
  | { type: "STREAM_END" }
  | { type: "DEBOUNCE_TICK" };

export const streamingMessageBubbleMachine = createMachine({
  types: {} as {
    context: StreamingMessageBubbleContext;
    events: StreamingMessageBubbleEvent;
  },
  id: "streamingMessageBubble",
  initial: "idle",
  context: {
    rawText: "",
    debouncedText: "",
    isStreaming: false,
  },
  states: {
    idle: {
      on: {
        STREAM_START: {
          target: "streaming",
          actions: assign({
            isStreaming: true,
            rawText: "",
            debouncedText: "",
          }),
        },
        TOKEN_RECEIVED: {
          actions: assign({
            rawText: ({ context, event }) => context.rawText + event.token,
            debouncedText: ({ context, event }) => context.debouncedText + event.token,
          }),
        },
      },
    },
    streaming: {
      invoke: {
        id: "debouncer",
        src: fromCallback(({ sendBack }) => {
          const interval = setInterval(() => {
            sendBack({ type: "DEBOUNCE_TICK" });
          }, 100);

          return () => {
            clearInterval(interval);
          };
        }),
      },
      on: {
        TOKEN_RECEIVED: {
          actions: assign({
            rawText: ({ context, event }) => context.rawText + event.token,
          }),
        },
        DEBOUNCE_TICK: {
          actions: assign({
            debouncedText: ({ context }) => {
              const text = context.rawText;
              // Check for incomplete LaTeX blocks.
              const dsCount = (text.match(/\$\$/g) || []).length;
              const hasIncompleteMathBlock =
                dsCount % 2 !== 0 || (text.includes("\\[") && !text.includes("\\]"));

              if (hasIncompleteMathBlock) {
                if (dsCount % 2 !== 0) {
                  const lastIdx = text.lastIndexOf("$$");
                  if (lastIdx !== -1) {
                    return text.slice(0, lastIdx) + "\\$\\$" + text.slice(lastIdx + 2);
                  }
                }
                if (text.includes("\\[") && !text.includes("\\]")) {
                  const lastIdx = text.lastIndexOf("\\[");
                  if (lastIdx !== -1) {
                    return text.slice(0, lastIdx) + "\\\\\\[" + text.slice(lastIdx + 2);
                  }
                }
              }
              return text;
            },
          }),
        },
        STREAM_END: {
          target: "idle",
          actions: assign({
            isStreaming: false,
            debouncedText: ({ context }) => context.rawText,
          }),
        },
      },
    },
  },
});
