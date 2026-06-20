import { createMachine, assign, fromPromise } from "xstate";
import { saveWorkflow, deleteWorkflow } from "./workflows-service";
import { WorkflowSchema } from "../db/db-schema";
import type { Workflow } from "../db/db-schema";
import { validateWorkflowStructure } from "./workflow-validation";

export interface WorkflowEditorContext {
  workflowId: string | null;
  jsonContent: string;
  originalContent: string;
  isDirty: boolean;
  isBuiltIn: boolean;
  validationErrors: string[];
  errorMessage: string | null;
}

export type WorkflowEditorEvent =
  | { type: "LOAD_WORKFLOW"; id: string | null; content: string; isBuiltIn: boolean }
  | { type: "CLONE_WORKFLOW" }
  | { type: "EDIT_JSON"; content: string }
  | { type: "SAVE" }
  | { type: "DELETE_WORKFLOW"; workflowId: string }
  | { type: "CANCEL" }
  | { type: "CONFIRM_DISCARD" }
  | { type: "ABORT_DISCARD" }
  | { type: "DISMISS_ERROR" };

export const workflowEditorMachine = createMachine(
  {
    types: {} as {
      context: WorkflowEditorContext;
      events: WorkflowEditorEvent;
    },
    id: "workflow-editor",
    initial: "idle",
    context: {
      workflowId: null,
      jsonContent: "",
      originalContent: "",
      isDirty: false,
      isBuiltIn: false,
      validationErrors: [],
      errorMessage: null,
    },
    states: {
      idle: {
        on: {
          LOAD_WORKFLOW: [
            {
              guard: ({ event }) => event.isBuiltIn,
              target: "viewing",
              actions: assign(({ event }) => ({
                workflowId: event.id,
                jsonContent: event.content,
                originalContent: event.content,
                isBuiltIn: true,
                isDirty: false,
                validationErrors: [],
                errorMessage: null,
              })),
            },
            {
              target: "editing.clean",
              actions: assign(({ event }) => ({
                workflowId: event.id,
                jsonContent: event.content,
                originalContent: event.content,
                isBuiltIn: false,
                isDirty: false,
                validationErrors: [],
                errorMessage: null,
              })),
            },
          ],
        },
      },
      viewing: {
        on: {
          LOAD_WORKFLOW: [
            {
              guard: ({ event }) => event.isBuiltIn,
              target: "viewing",
              actions: assign(({ event }) => ({
                workflowId: event.id,
                jsonContent: event.content,
                originalContent: event.content,
                isBuiltIn: true,
                isDirty: false,
                validationErrors: [],
                errorMessage: null,
              })),
            },
            {
              target: "editing.clean",
              actions: assign(({ event }) => ({
                workflowId: event.id,
                jsonContent: event.content,
                originalContent: event.content,
                isBuiltIn: false,
                isDirty: false,
                validationErrors: [],
                errorMessage: null,
              })),
            },
          ],
          CLONE_WORKFLOW: {
            target: "editing.dirty",
            actions: "cloneWorkflowAction",
          },
          DELETE_WORKFLOW: {
            target: "deleting",
          },
          CANCEL: {
            target: "idle",
            actions: "resetContext",
          },
        },
      },
      editing: {
        initial: "clean",
        states: {
          clean: {
            on: {
              EDIT_JSON: {
                target: "dirty",
                actions: assign(({ event }) => ({
                  jsonContent: event.content,
                  isDirty: true,
                })),
              },
              CANCEL: {
                target: "#workflow-editor.idle",
                actions: "resetContext",
              },
              DELETE_WORKFLOW: {
                target: "#workflow-editor.deleting",
              },
              CLONE_WORKFLOW: {
                target: "dirty",
                actions: "cloneWorkflowAction",
              },
            },
          },
          dirty: {
            on: {
              EDIT_JSON: {
                actions: assign(({ event }) => ({
                  jsonContent: event.content,
                  isDirty: true,
                })),
              },
              SAVE: {
                target: "#workflow-editor.validating",
              },
              CANCEL: {
                target: "#workflow-editor.promptingDiscard",
              },
              DELETE_WORKFLOW: {
                target: "#workflow-editor.deleting",
              },
            },
          },
        },
      },
      validating: {
        invoke: {
          src: "validateWorkflowActor",
          input: ({ context }) => context.jsonContent,
          onDone: {
            target: "saving",
          },
          onError: {
            target: "editing.dirty",
            actions: assign(({ event }) => ({
              validationErrors:
                event.error instanceof Error
                  ? [event.error.message]
                  : Array.isArray(event.error)
                    ? (event.error as string[])
                    : ["Validation failed"],
            })),
          },
        },
      },
      saving: {
        invoke: {
          src: "saveWorkflowActor",
          input: ({ context }) => ({
            workflowId: context.workflowId,
            jsonContent: context.jsonContent,
          }),
          onDone: {
            target: "idle",
            actions: "resetContext",
          },
          onError: {
            target: "error",
            actions: assign(({ event }) => ({
              errorMessage:
                event.error instanceof Error ? event.error.message : "Failed to save workflow",
            })),
          },
        },
      },
      deleting: {
        invoke: {
          src: "deleteWorkflowActor",
          input: ({ context }) => context.workflowId!,
          onDone: {
            target: "idle",
            actions: "resetContext",
          },
          onError: [
            {
              guard: ({ context }) => context.isBuiltIn,
              target: "viewing",
              actions: assign(({ event }) => ({
                errorMessage:
                  event.error instanceof Error ? event.error.message : "Failed to delete workflow",
              })),
            },
            {
              target: "editing.clean",
              actions: assign(({ event }) => ({
                errorMessage:
                  event.error instanceof Error ? event.error.message : "Failed to delete workflow",
              })),
            },
          ],
        },
      },
      promptingDiscard: {
        on: {
          CONFIRM_DISCARD: {
            target: "idle",
            actions: "resetContext",
          },
          ABORT_DISCARD: {
            target: "editing.dirty",
          },
        },
      },
      error: {
        on: {
          SAVE: {
            target: "validating",
          },
          CANCEL: {
            // Since it's error state but dirty, canceling should prompt discard if isDirty
            guard: ({ context }) => context.isDirty,
            target: "promptingDiscard",
          },
          EDIT_JSON: {
            target: "editing.dirty",
            actions: assign(({ event }) => ({
              jsonContent: event.content,
              isDirty: true,
            })),
          },
          DISMISS_ERROR: {
            target: "editing.dirty",
            actions: assign({
              errorMessage: () => null,
            }),
          },
        },
      },
    },
  },
  {
    actions: {
      cloneWorkflowAction: assign(({ context }) => {
        let content = context.jsonContent;
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            if (parsed.name) {
              parsed.name = `Copy of ${parsed.name}`;
            }
            parsed.id =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2);
            parsed.isBuiltIn = false;
            content = JSON.stringify(parsed, null, 2);
          }
        } catch {
          // If JSON parse error, don't modify structure
        }
        return {
          workflowId: null,
          isBuiltIn: false,
          isDirty: true,
          jsonContent: content,
          validationErrors: [],
          errorMessage: null,
        };
      }),
      resetContext: assign({
        workflowId: () => null,
        jsonContent: () => "",
        originalContent: () => "",
        isDirty: () => false,
        isBuiltIn: () => false,
        validationErrors: () => [],
        errorMessage: () => null,
      }),
    },
    actors: {
      validateWorkflowActor: fromPromise(async ({ input }: { input: string }) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(input);
        } catch (e) {
          throw new Error("Invalid JSON syntax: " + (e instanceof Error ? e.message : String(e)));
        }

        const result = WorkflowSchema.safeParse(parsed);
        if (!result.success) {
          const errors = result.error.issues.map(
            (err) => `Path "${err.path.join(".")}": ${err.message}`,
          );
          throw errors;
        }

        const workflow = result.data;
        const structuralErrors = validateWorkflowStructure(workflow);
        if (structuralErrors.length > 0) {
          throw structuralErrors;
        }

        return workflow;
      }),
      saveWorkflowActor: fromPromise(
        async ({ input }: { input: { workflowId: string | null; jsonContent: string } }) => {
          const parsed = JSON.parse(input.jsonContent) as Workflow;
          if (!parsed.id) {
            parsed.id =
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2);
          }
          await saveWorkflow(parsed);
        },
      ),
      deleteWorkflowActor: fromPromise(async ({ input }: { input: string }) => {
        await deleteWorkflow(input);
      }),
    },
  },
);
