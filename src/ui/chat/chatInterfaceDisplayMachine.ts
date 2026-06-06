import { setup, assign } from "xstate";

export const chatInterfaceDisplayMachine = setup({
  types: {
    context: {} as {
      showSettings: boolean;
      showPayloadPreview: boolean;
    },
    events: {} as
      | { type: "OPEN_SETTINGS" }
      | { type: "CLOSE_SETTINGS" }
      | { type: "OPEN_PAYLOAD_PREVIEW" }
      | { type: "CLOSE_PAYLOAD_PREVIEW" },
  },
  actions: {
    openSettings: assign({ showSettings: true }),
    closeSettings: assign({ showSettings: false }),
    openPayloadPreview: assign({ showPayloadPreview: true }),
    closePayloadPreview: assign({ showPayloadPreview: false }),
  },
}).createMachine({
  id: "chatInterfaceDisplay",
  initial: "active",
  context: {
    showSettings: false,
    showPayloadPreview: false,
  },
  states: {
    active: {
      on: {
        OPEN_SETTINGS: {
          actions: "openSettings",
        },
        CLOSE_SETTINGS: {
          actions: "closeSettings",
        },
        OPEN_PAYLOAD_PREVIEW: {
          actions: "openPayloadPreview",
        },
        CLOSE_PAYLOAD_PREVIEW: {
          actions: "closePayloadPreview",
        },
      },
    },
  },
});
