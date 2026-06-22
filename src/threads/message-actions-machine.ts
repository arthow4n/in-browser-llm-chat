import { createMachine, assign } from "xstate";

export interface MessageActionsContext {
  messageId: string;
  originalContent: string;
  editContent: string;
  role: string;
  isValidContent: boolean;
  branchNameInput: string;
  errorMessage: string | null;
}

export type MessageActionsEvent =
  | { type: "OPEN_MENU" }
  | { type: "CLOSE_MENU" }
  | { type: "EDIT" }
  | { type: "UPDATE_CONTENT"; content: string }
  | { type: "VALIDATION_RESULT"; isValid: boolean }
  | { type: "SAVE" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_FAILURE"; error: unknown }
  | { type: "CANCEL_EDIT" }
  | { type: "CONFIRM_DISCARD" }
  | { type: "ABORT_DISCARD" }
  | { type: "TRIGGER_DELETE" }
  | { type: "CONFIRM_DELETE" }
  | { type: "CANCEL_DELETE" }
  | { type: "DELETE_SUCCESS" }
  | { type: "DELETE_FAILURE"; error: unknown }
  | { type: "TRIGGER_BRANCH"; defaultBranchName: string }
  | { type: "UPDATE_BRANCH_NAME"; name: string }
  | { type: "CONFIRM_BRANCH" }
  | { type: "CANCEL_BRANCH" }
  | { type: "BRANCH_SUCCESS"; newThreadId: string }
  | { type: "BRANCH_FAILURE"; error: unknown };

export const messageActionsMachine = createMachine({
  types: {} as {
    context: MessageActionsContext;
    events: MessageActionsEvent;
    input: {
      messageId: string;
      originalContent: string;
      role: string;
    };
  },
  id: "messageActions",
  initial: "viewing",
  context: ({ input }) => ({
    messageId: input?.messageId || "",
    originalContent: input?.originalContent || "",
    editContent: input?.originalContent || "",
    role: input?.role || "user",
    isValidContent: true,
    branchNameInput: "",
    errorMessage: null,
  }),
  states: {
    viewing: {
      initial: "idle",
      states: {
        idle: {
          on: {
            OPEN_MENU: {
              target: "menuOpen",
            },
            TRIGGER_DELETE: {
              target: "#messageActions.promptingDelete",
            },
            TRIGGER_BRANCH: {
              target: "#messageActions.promptingBranch",
              actions: assign({
                branchNameInput: ({ event }) => event.defaultBranchName,
                errorMessage: () => null,
              }),
            },
          },
        },
        menuOpen: {
          on: {
            CLOSE_MENU: {
              target: "idle",
            },
            EDIT: {
              target: "#messageActions.editing.idle",
              actions: assign({
                editContent: ({ context }) => context.originalContent,
                isValidContent: () => true,
                errorMessage: () => null,
              }),
            },
            TRIGGER_DELETE: {
              target: "#messageActions.promptingDelete",
            },
            TRIGGER_BRANCH: {
              target: "#messageActions.promptingBranch",
              actions: assign({
                branchNameInput: ({ event }) => event.defaultBranchName,
                errorMessage: () => null,
              }),
            },
          },
        },
      },
    },
    editing: {
      initial: "idle",
      states: {
        idle: {
          on: {
            UPDATE_CONTENT: {
              target: "validating",
              actions: assign({
                editContent: ({ event }) => event.content,
              }),
            },
            SAVE: {
              guard: ({ context }) => context.isValidContent,
              target: "#messageActions.saving",
            },
            CANCEL_EDIT: [
              {
                guard: ({ context }) => context.editContent === context.originalContent,
                target: "#messageActions.viewing.idle",
              },
              {
                target: "#messageActions.promptingDiscard",
              },
            ],
          },
        },
        validating: {
          always: {
            target: "idle",
            actions: assign({
              isValidContent: ({ context }) => {
                if (context.role === "user") {
                  return context.editContent.trim().length > 0;
                }
                return true;
              },
            }),
          },
          on: {
            VALIDATION_RESULT: {
              target: "idle",
              actions: assign({
                isValidContent: ({ event }) => event.isValid,
              }),
            },
          },
        },
      },
    },
    promptingDiscard: {
      on: {
        CONFIRM_DISCARD: {
          target: "viewing.idle",
          actions: assign({
            editContent: ({ context }) => context.originalContent,
          }),
        },
        ABORT_DISCARD: {
          target: "editing.idle",
        },
      },
    },
    saving: {
      on: {
        SAVE_SUCCESS: {
          target: "viewing.idle",
          actions: assign({
            originalContent: ({ context }) => context.editContent,
          }),
        },
        SAVE_FAILURE: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => {
              if (event.error instanceof Error) return event.error.message;
              return typeof event.error === "string" ? event.error : "Failed to save message";
            },
          }),
        },
      },
    },
    promptingDelete: {
      on: {
        CONFIRM_DELETE: {
          target: "deleting",
        },
        CANCEL_DELETE: {
          target: "viewing.idle",
        },
      },
    },
    deleting: {
      on: {
        DELETE_SUCCESS: {
          target: "viewing.idle",
        },
        DELETE_FAILURE: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => {
              if (event.error instanceof Error) return event.error.message;
              return typeof event.error === "string" ? event.error : "Failed to delete message";
            },
          }),
        },
      },
    },
    promptingBranch: {
      on: {
        UPDATE_BRANCH_NAME: {
          actions: assign({
            branchNameInput: ({ event }) => event.name,
          }),
        },
        CONFIRM_BRANCH: {
          target: "branching",
        },
        CANCEL_BRANCH: {
          target: "viewing.idle",
        },
      },
    },
    branching: {
      on: {
        BRANCH_SUCCESS: {
          target: "viewing.idle",
        },
        BRANCH_FAILURE: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => {
              if (event.error instanceof Error) return event.error.message;
              return typeof event.error === "string" ? event.error : "Failed to branch thread";
            },
          }),
        },
      },
    },
    error: {
      on: {
        SAVE: {
          target: "saving",
        },
        CONFIRM_DELETE: {
          target: "deleting",
        },
        CONFIRM_BRANCH: {
          target: "branching",
        },
        CANCEL_EDIT: {
          target: "viewing.idle",
        },
        CANCEL_DELETE: {
          target: "viewing.idle",
        },
        CANCEL_BRANCH: {
          target: "viewing.idle",
        },
      },
    },
  },
});
