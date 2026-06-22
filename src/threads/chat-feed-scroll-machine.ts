import { createMachine, assign } from "xstate";

export interface ChatFeedScrollContext {
  isAtBottom: boolean;
  scrollTimeout: number | null;
}

export type ChatFeedScrollEvent =
  | { type: "SCROLL_EVENT"; isNearBottom: boolean }
  | { type: "NEW_MESSAGE" }
  | { type: "NEW_TOKEN" }
  | { type: "SCROLL_TO_BOTTOM_CLICKED" };

export const chatFeedScrollMachine = createMachine({
  types: {} as {
    context: ChatFeedScrollContext;
    events: ChatFeedScrollEvent;
  },
  id: "chatFeedScroll",
  initial: "lockedToBottom",
  context: {
    isAtBottom: true,
    scrollTimeout: null,
  },
  states: {
    lockedToBottom: {
      entry: assign({
        isAtBottom: true,
      }),
      on: {
        SCROLL_EVENT: [
          {
            guard: ({ event }) => !event.isNearBottom,
            target: "userScrolledUp",
          },
          {
            actions: assign({
              isAtBottom: true,
            }),
          },
        ],
        NEW_MESSAGE: {
          actions: "scrollToBottom",
        },
        NEW_TOKEN: {
          actions: "scrollToBottom",
        },
      },
    },
    userScrolledUp: {
      entry: assign({
        isAtBottom: false,
      }),
      on: {
        SCROLL_EVENT: [
          {
            guard: ({ event }) => event.isNearBottom,
            target: "lockedToBottom",
          },
          {
            actions: assign({
              isAtBottom: false,
            }),
          },
        ],
        SCROLL_TO_BOTTOM_CLICKED: {
          target: "lockedToBottom",
          actions: "scrollToBottom",
        },
        NEW_MESSAGE: {},
        NEW_TOKEN: {},
      },
    },
  },
});
