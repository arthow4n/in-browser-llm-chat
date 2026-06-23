import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { useNavigate } from "react-router";
import { createMachine, assign, fromPromise } from "xstate";
import { listWorkflows } from "../workflows/workflows-service";
import { listPresets, saveThread, saveMessage, getSetting } from "../db/db-operations";
import type { Preset, Workflow, Thread, Message } from "../db/db-schema";

export interface NewChatContext {
  workflows: Workflow[];
  presets: Preset[];
  selectedWorkflowId: string;
  selectedPresetId: string;
  prompt: string;
  errorMessage: string | null;
  createdThreadId: string | null;
}

export type NewChatEvent =
  | { type: "LOAD" }
  | { type: "SELECT_WORKFLOW"; workflowId: string }
  | { type: "SELECT_PRESET"; presetId: string }
  | { type: "UPDATE_PROMPT"; prompt: string }
  | { type: "SUBMIT" }
  | { type: "DISMISS_ERROR" };

export const newChatMachine = createMachine(
  {
    types: {} as {
      context: NewChatContext;
      events: NewChatEvent;
    },
    id: "newChat",
    initial: "loading",
    context: {
      workflows: [],
      presets: [],
      selectedWorkflowId: "standard-1-agent",
      selectedPresetId: "",
      prompt: "",
      errorMessage: null,
      createdThreadId: null,
    },
    states: {
      loading: {
        invoke: {
          src: "loadInitialData",
          onDone: {
            target: "idle",
            actions: assign({
              workflows: ({ event }) => event.output.workflows,
              presets: ({ event }) => event.output.presets,
              selectedPresetId: ({ event }) => {
                const defaultPreset = event.output.defaultPresetId || "";
                if (
                  defaultPreset &&
                  event.output.presets.some((p: Preset) => p.id === defaultPreset)
                ) {
                  return defaultPreset;
                }
                return event.output.presets[0]?.id || "";
              },
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to load initial data",
            }),
          },
        },
      },
      idle: {
        on: {
          SELECT_WORKFLOW: {
            actions: assign({
              selectedWorkflowId: ({ event }) => event.workflowId,
            }),
          },
          SELECT_PRESET: {
            actions: assign({
              selectedPresetId: ({ event }) => event.presetId,
            }),
          },
          UPDATE_PROMPT: {
            actions: assign({
              prompt: ({ event }) => event.prompt,
            }),
          },
          SUBMIT: {
            target: "submitting",
            guard: "isPromptNotEmpty",
          },
          DISMISS_ERROR: {
            actions: assign({
              errorMessage: () => null,
            }),
          },
        },
      },
      submitting: {
        invoke: {
          src: "createThreadAndPrompt",
          input: ({ context }) => ({
            workflowId: context.selectedWorkflowId,
            presetId: context.selectedPresetId,
            prompt: context.prompt,
            workflows: context.workflows,
          }),
          onDone: {
            target: "success",
            actions: assign({
              createdThreadId: ({ event }) => event.output.threadId,
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              errorMessage: ({ event }) =>
                event.error instanceof Error ? event.error.message : "Failed to start chat thread",
            }),
          },
        },
      },
      success: {
        type: "final",
      },
    },
  },
  {
    guards: {
      isPromptNotEmpty: ({ context }) => context.prompt.trim().length > 0,
    },
    actors: {
      loadInitialData: fromPromise(async () => {
        const workflows = await listWorkflows();
        const presets = await listPresets();
        let defaultPresetId = "";
        try {
          defaultPresetId = (await getSetting("default_preset_id")) || "";
        } catch (e) {
          console.error(e);
        }
        return { workflows, presets, defaultPresetId };
      }),
      createThreadAndPrompt: fromPromise(
        async ({
          input,
        }: {
          input: {
            workflowId: string;
            presetId: string;
            prompt: string;
            workflows: Workflow[];
          };
        }) => {
          const { workflowId, presetId, prompt, workflows } = input;

          const workflow = workflows.find((w) => w.id === workflowId);
          if (!workflow) {
            throw new Error(`Selected workflow ${workflowId} not found`);
          }

          const threadId = crypto.randomUUID();
          const title = prompt.trim().substring(0, 40) || "New Chat";
          const now = Date.now();

          const newThread: Thread = {
            id: threadId,
            title,
            workflowId,
            workflowSnapshot: workflow,
            activePresetId: presetId,
            createdAt: now,
            updatedAt: now,
            parentThreadId: null,
            parentMessageId: null,
            status: "executing",
            activeInterrupt: null,
            errorMessage: null,
            latestCheckpointId: null,
            latestCheckpointNs: null,
            tokenStats: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };

          const messageId = crypto.randomUUID();
          const userMessage: Message = {
            id: messageId,
            threadId,
            sequence: 1,
            role: "user",
            content: prompt,
            type: "text",
            createdAt: now,
            name: "User",
            checkpointId: null,
            checkpointNs: null,
          };

          await saveThread(newThread);
          await saveMessage(userMessage);

          return { threadId };
        },
      ),
    },
  },
);

export function NewChatComponent() {
  const [state, send] = useMachine(newChatMachine);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.matches("success") && state.context.createdThreadId) {
      void navigate(`/threads/${state.context.createdThreadId}`);
    }
  }, [state, navigate]);

  if (state.matches("loading")) {
    return (
      <div className="chat-loading" data-testid="new-chat-loading">
        <span className="spinner"></span>
        <p>Loading setup options...</p>
      </div>
    );
  }

  const { workflows, presets, selectedWorkflowId, selectedPresetId, prompt, errorMessage } =
    state.context;
  const isSubmitting = state.matches("submitting");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      send({ type: "SUBMIT" });
    }
  };

  return (
    <div
      className="settings-panel-container"
      data-testid="new-chat-view"
      style={{ margin: "2rem auto" }}
    >
      <header className="settings-header">
        <h2>Start a New Conversation</h2>
        <p className="settings-subtitle">
          Select an agent workflow, configure your active LLM preset, and enter your initial
          message.
        </p>
      </header>

      {errorMessage && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: "1.5rem" }}>
          <span>{errorMessage}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: "1rem" }}
            onClick={() => send({ type: "DISMISS_ERROR" })}
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="settings-section">
          <div className="settings-group">
            <div className="settings-field">
              <label htmlFor="new-chat-workflow">Agent Workflow</label>
              <select
                id="new-chat-workflow"
                value={selectedWorkflowId}
                onChange={(e) => send({ type: "SELECT_WORKFLOW", workflowId: e.target.value })}
                disabled={isSubmitting}
              >
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <label htmlFor="new-chat-preset">LLM Preset</label>
              <select
                id="new-chat-preset"
                value={selectedPresetId}
                onChange={(e) => send({ type: "SELECT_PRESET", presetId: e.target.value })}
                disabled={isSubmitting}
              >
                {presets.length === 0 ? (
                  <option value="">No presets configured</option>
                ) : (
                  presets.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name} ({pr.provider}) - {pr.model}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-field">
            <label htmlFor="new-chat-prompt">Initial Topic or Question</label>
            <textarea
              id="new-chat-prompt"
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "0.75rem",
                borderRadius: "8px",
                background: "var(--input-bg)",
                border: "1px solid var(--surface-border)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                fontSize: "1rem",
                resize: "vertical",
              }}
              value={prompt}
              onChange={(e) => send({ type: "UPDATE_PROMPT", prompt: e.target.value })}
              placeholder={
                selectedWorkflowId === "debate"
                  ? "Enter the topic you want the agents to debate..."
                  : "How can I help you today?"
              }
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !prompt.trim() || presets.length === 0}
            style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
          >
            {isSubmitting ? "Starting..." : "Launch Chat Thread 🚀"}
          </button>
        </div>
      </form>
    </div>
  );
}
