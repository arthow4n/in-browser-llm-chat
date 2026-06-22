import { createMachine, assign } from "xstate";

export interface MessageAccordionContext {
  isOpen: boolean;
}

export type MessageAccordionEvent = { type: "TOGGLE_EXPAND" } | { type: "TOGGLE_COLLAPSE" };

export const messageAccordionMachine = createMachine({
  types: {} as {
    context: MessageAccordionContext;
    events: MessageAccordionEvent;
  },
  id: "messageAccordion",
  initial: "collapsed",
  context: {
    isOpen: false,
  },
  states: {
    collapsed: {
      entry: assign({
        isOpen: false,
      }),
      on: {
        TOGGLE_EXPAND: {
          target: "expanded",
        },
      },
    },
    expanded: {
      entry: assign({
        isOpen: true,
      }),
      on: {
        TOGGLE_COLLAPSE: {
          target: "collapsed",
        },
      },
    },
  },
});
