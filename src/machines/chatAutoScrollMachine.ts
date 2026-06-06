import { createMachine } from "xstate";

export const chatAutoScrollMachine = createMachine({
  id: "chatAutoScroll",
  initial: "enabled",
  states: {
    enabled: {
      on: {
        USER_SCROLLED_UP: { target: "disabled" },
        MESSAGE_ARRIVED: { actions: "scrollToBottom" },
      },
    },
    disabled: {
      on: {
        USER_SCROLLED_TO_BOTTOM: { target: "enabled" },
        FORCE_SCROLL_BOTTOM: { target: "enabled", actions: "scrollToBottom" },
      },
    },
  },
});
