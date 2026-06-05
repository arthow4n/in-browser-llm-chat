import { setup, assign, fromPromise } from "xstate";
import { getWorkflow, saveWorkflow, deleteWorkflow, type WorkflowStore } from "../../db/db.js";
import {
  validateWorkflow,
  WorkflowNodeSchema,
  WorkflowEdgeSchema,
} from "../../workflow/schemas.js";
import { z } from "zod";

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
  | { type: "VALIDATE_SUCCESS" }
  | { type: "VALIDATE_FAILURE"; errors: string[] }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_FAILURE"; error: string }
  | { type: "DELETE_WORKFLOW"; workflowId: string }
  | { type: "DELETE_SUCCESS" }
  | { type: "CANCEL" }
  | { type: "CONFIRM_DISCARD" }
  | { type: "ABORT_DISCARD" }
  | { type: "DISMISS_ERROR" };

const DefaultWorkflowTemplate = {
  name: "New Custom Workflow",
  description: "A custom workflow graph.",
  nodes: [
    {
      id: "input",
      type: "input",
      name: "User Input",
    },
    {
      id: "agent",
      type: "agent",
      name: "AI Agent",
      systemPrompt: "You are a helpful assistant.",
      tools: [],
    },
  ],
  edges: [
    {
      from: "input",
      to: "agent",
    },
    {
      from: "agent",
      to: "input",
    },
  ],
};

const JSONWorkflowSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  description: z.string().min(1, "Description cannot be empty"),
  nodes: z.array(WorkflowNodeSchema).min(1, "At least one node is required"),
  edges: z.array(WorkflowEdgeSchema),
  injectedSystemMessages: z
    .array(
      z.object({
        content: z.string().min(1, "System message content cannot be empty"),
        depth: z.number(),
      }),
    )
    .optional(),
});

function getErrorMessage(event: unknown, defaultMessage: string): string {
  if (event && typeof event === "object" && "error" in event) {
    const err = event.error;
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object" && "message" in err) {
      return String(err.message);
    }
  }
  return defaultMessage;
}

export const workflowEditorMachine = setup({
  types: {
    context: {} as WorkflowEditorContext,
    events: {} as WorkflowEditorEvent,
    input: {} as { workflowId: string | null },
  },
  actors: {
    loadWorkflowActor: fromPromise(async ({ input }: { input: { workflowId: string | null } }) => {
      if (!input.workflowId) {
        const defaultJSON = JSON.stringify(DefaultWorkflowTemplate, null, 2);
        return {
          id: null,
          jsonContent: defaultJSON,
          isBuiltIn: false,
        };
      }
      const workflow = await getWorkflow(input.workflowId);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
      const { id, isBuiltIn, ...rest } = workflow;
      return {
        id,
        jsonContent: JSON.stringify(rest, null, 2),
        isBuiltIn,
      };
    }),
    saveWorkflowActor: fromPromise(
      async ({ input }: { input: { id: string | null; jsonContent: string } }) => {
        const parsed = JSON.parse(input.jsonContent);
        const recordId = input.id || crypto.randomUUID();
        const record: WorkflowStore = {
          ...parsed,
          id: recordId,
          isBuiltIn: false,
        };
        await saveWorkflow(record);
        return record;
      },
    ),
    deleteWorkflowActor: fromPromise(async ({ input }: { input: { id: string } }) => {
      await deleteWorkflow(input.id);
    }),
  },
}).createMachine({
  id: "workflowEditor",
  initial: "loading",
  context: ({ input }) => ({
    workflowId: input?.workflowId ?? null,
    jsonContent: "",
    originalContent: "",
    isDirty: false,
    isBuiltIn: false,
    validationErrors: [],
    errorMessage: null,
  }),
  states: {
    loading: {
      invoke: {
        src: "loadWorkflowActor",
        input: ({ context }) => ({ workflowId: context.workflowId }),
        onDone: {
          actions: assign({
            workflowId: ({ event }) => event.output.id,
            jsonContent: ({ event }) => event.output.jsonContent,
            originalContent: ({ event }) => event.output.jsonContent,
            isBuiltIn: ({ event }) => event.output.isBuiltIn,
            isDirty: () => false,
            errorMessage: () => null,
          }),
          target: "checkInitialState",
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => getErrorMessage(event, "Failed to load workflow"),
          }),
        },
      },
    },
    checkInitialState: {
      always: [
        {
          guard: ({ context }) => context.isBuiltIn,
          target: "viewing",
        },
        {
          target: "editing.clean",
        },
      ],
    },
    viewing: {
      on: {
        CLONE_WORKFLOW: {
          target: "editing.dirty",
          actions: assign({
            workflowId: () => null,
            isBuiltIn: () => false,
            isDirty: () => true,
            jsonContent: ({ context }) => {
              try {
                const parsed = JSON.parse(context.jsonContent);
                parsed.name = `Copy of ${parsed.name}`;
                return JSON.stringify(parsed, null, 2);
              } catch {
                return context.jsonContent;
              }
            },
          }),
        },
        DELETE_WORKFLOW: {
          target: "deleting",
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
              actions: assign({
                jsonContent: ({ event }) => (event.type === "EDIT_JSON" ? event.content : ""),
                isDirty: () => true,
              }),
            },
            CLONE_WORKFLOW: {
              target: "dirty",
              actions: assign({
                workflowId: () => null,
                isBuiltIn: () => false,
                isDirty: () => true,
                jsonContent: ({ context }) => {
                  try {
                    const parsed = JSON.parse(context.jsonContent);
                    parsed.name = `Copy of ${parsed.name}`;
                    return JSON.stringify(parsed, null, 2);
                  } catch {
                    return context.jsonContent;
                  }
                },
              }),
            },
            DELETE_WORKFLOW: {
              target: "#workflowEditor.deleting",
            },
            CANCEL: {
              target: "#workflowEditor.discarded",
            },
          },
        },
        dirty: {
          on: {
            EDIT_JSON: {
              actions: assign({
                jsonContent: ({ event }) => (event.type === "EDIT_JSON" ? event.content : ""),
                isDirty: ({ context, event }) => {
                  return event.type === "EDIT_JSON"
                    ? event.content !== context.originalContent
                    : context.isDirty;
                },
              }),
              target: "checkDirtiness",
            },
            SAVE: {
              target: "#workflowEditor.validating",
            },
            DELETE_WORKFLOW: {
              target: "#workflowEditor.deleting",
            },
            CANCEL: {
              target: "#workflowEditor.promptingDiscard",
            },
          },
        },
        checkDirtiness: {
          always: [
            {
              guard: ({ context }) => !context.isDirty,
              target: "clean",
            },
            {
              target: "dirty",
            },
          ],
        },
      },
      on: {
        // Global events that can target editing from sub-states or handle actions
        LOAD_WORKFLOW: {
          actions: assign({
            workflowId: ({ event }) => event.id,
            jsonContent: ({ event }) => event.content,
            originalContent: ({ event }) => event.content,
            isBuiltIn: ({ event }) => event.isBuiltIn,
            isDirty: () => false,
            errorMessage: () => null,
            validationErrors: () => [],
          }),
          target: "checkInitialState",
        },
      },
    },
    validating: {
      always: [
        {
          actions: assign(({ context }) => {
            const errors: string[] = [];
            let parsed: unknown;
            try {
              parsed = JSON.parse(context.jsonContent);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                validationErrors: [`JSON Syntax Error: ${msg}`],
              };
            }

            const zodResult = JSONWorkflowSchema.safeParse(parsed);
            if (!zodResult.success) {
              const zodErrors = zodResult.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
              );
              errors.push(...zodErrors);
            } else {
              const structuralResult = validateWorkflow(zodResult.data.nodes, zodResult.data.edges);
              if (!structuralResult.success) {
                errors.push(...structuralResult.errors);
              }
            }

            return {
              validationErrors: errors,
            };
          }),
          guard: ({ context }) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(context.jsonContent);
            } catch {
              return true; // fail validation
            }
            const zodResult = JSONWorkflowSchema.safeParse(parsed);
            if (!zodResult.success) return true;
            const structuralResult = validateWorkflow(zodResult.data.nodes, zodResult.data.edges);
            return !structuralResult.success;
          },
          target: "editing.dirty",
        },
        {
          target: "saving",
        },
      ],
    },
    saving: {
      invoke: {
        src: "saveWorkflowActor",
        input: ({ context }) => ({
          id: context.workflowId,
          jsonContent: context.jsonContent,
        }),
        onDone: {
          target: "editing.clean",
          actions: assign({
            workflowId: ({ event }) => event.output.id,
            originalContent: ({ context }) => context.jsonContent,
            isDirty: () => false,
            validationErrors: () => [],
            errorMessage: () => null,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => getErrorMessage(event, "Failed to save workflow"),
          }),
        },
      },
    },
    deleting: {
      invoke: {
        src: "deleteWorkflowActor",
        input: ({ context }) => ({ id: context.workflowId! }),
        onDone: {
          target: "deleteSuccess",
        },
        onError: {
          actions: assign({
            errorMessage: ({ event }) => getErrorMessage(event, "Failed to delete workflow"),
          }),
          target: "checkInitialState",
        },
      },
    },
    deleteSuccess: {
      type: "final",
    },
    promptingDiscard: {
      on: {
        CONFIRM_DISCARD: {
          target: "discarded",
        },
        ABORT_DISCARD: {
          target: "editing.dirty",
        },
      },
    },
    discarded: {
      type: "final",
    },
    error: {
      on: {
        SAVE: {
          target: "validating",
        },
        CANCEL: {
          target: "editing.clean",
        },
        DISMISS_ERROR: {
          actions: assign({ errorMessage: () => null }),
        },
      },
    },
  },
});
