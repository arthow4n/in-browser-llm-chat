import { setup, assign } from "xstate";
import { POPULAR_MODELS, Provider } from "./modelConstants";

export interface ModelSelectionContext {
  isCustomModel: boolean;
  customModelId: string;
}

export type ModelSelectionEvent =
  | { type: "SET_CUSTOM_MODEL"; isCustom: boolean; modelId?: string }
  | { type: "UPDATE_CUSTOM_ID"; id: string }
  | { type: "SYNC_MODEL"; model: string; provider: Provider };

export const modelSelectionMachine = setup({
  types: {} as {
    context: ModelSelectionContext;
    events: ModelSelectionEvent;
  },
  actions: {
    updateCustomModel: assign(({ context, event }) => {
      if (event.type === "SET_CUSTOM_MODEL") {
        return {
          isCustomModel: event.isCustom,
          customModelId: event.modelId ?? context.customModelId,
        };
      }
      if (event.type === "UPDATE_CUSTOM_ID") {
        return {
          customModelId: event.id,
        };
      }
      if (event.type === "SYNC_MODEL") {
        const popularList = POPULAR_MODELS[event.provider];
        const isModelPopular = popularList.some((m) => m.value === event.model);
        return {
          isCustomModel: !isModelPopular,
          customModelId: isModelPopular ? "" : event.model,
        };
      }
      return {};
    }),
  },
}).createMachine({
  id: "modelSelection",
  initial: "idle",
  context: {
    isCustomModel: false,
    customModelId: "",
  },
  states: {
    idle: {
      on: {
        SET_CUSTOM_MODEL: {
          actions: ["updateCustomModel"],
        },
        UPDATE_CUSTOM_ID: {
          actions: ["updateCustomModel"],
        },
        SYNC_MODEL: {
          actions: ["updateCustomModel"],
        },
      },
    },
  },
});
