import { setup } from "xstate";

export const layoutMachine = setup({
  types: {
    events: {} as { type: "TOGGLE_SIDEBAR" },
  },
}).createMachine({
  id: "layout",
  initial: "sidebarOpen",
  states: {
    sidebarOpen: {
      on: {
        TOGGLE_SIDEBAR: "sidebarClosed",
      },
    },
    sidebarClosed: {
      on: {
        TOGGLE_SIDEBAR: "sidebarOpen",
      },
    },
  },
});
