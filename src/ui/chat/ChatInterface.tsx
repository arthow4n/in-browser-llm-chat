import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useMachine } from "@xstate/react";
import { Header, HeaderName, HeaderGlobalBar, Content, Button, Dropdown } from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import { parentCoordinatorMachine } from "../../workflow/parentCoordinator";
import { ThreadSettingsModal } from "./ThreadSettingsModal";
import { ExecutionControlPanel } from "./ExecutionControlPanel";
import { ChatInputArea } from "./ChatInputArea";
import { ChatFeed } from "../ChatFeed";
import { BudgetExceededCard } from "../BudgetExceededCard";
import { ErrorBubble } from "../ErrorBubble";
import { ApiPayloadPreviewModal } from "./ApiPayloadPreviewModal";
import { compilePayloadForAgent } from "../../workflow/compiler";
import {
  getAllPresets,
  getThread,
  getMessagesForThread,
  getSetting,
  getWorkflow,
  type PresetStore,
  type ThreadStore,
  type MessageStore,
} from "../../db/db";
import { type CoordinatorEvent } from "../../workflow/parentCoordinator";
import { type WorkflowNode } from "../../workflow/schemas";
import { type CompiledPayloadMessage } from "../../workflow/compiler";

export function ChatInterface() {
  const { threadId } = useParams();
  const [state, send] = useMachine(parentCoordinatorMachine);
  const [showSettings, setShowSettings] = useState(false);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<CompiledPayloadMessage[] | null>(null);
  const [presets, setPresets] = useState<PresetStore[]>([]);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [globalInjectedMessages, setGlobalInjectedMessages] = useState<
    Array<{ content: string; depth: number }>
  >([]);
  const [thread, setThread] = useState<ThreadStore | undefined | null>(null);
  const [messages, setMessages] = useState<MessageStore[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});

  const activePreset = presets.find((p) => p.id === state.context.activePresetId);
  const activePresetName = activePreset?.name || "No preset selected";

  useEffect(() => {
    async function loadData() {
      const p = await getAllPresets();
      setPresets(p);
      const injected = await getSetting<Array<{ content: string; depth: number }>>(
        "injected_system_messages",
      );
      setGlobalInjectedMessages(injected || []);
      if (threadId) {
        const t = await getThread(threadId);
        setThread(t);
        setDraftAnswers(t?.draftAnswers || {});
        const m = await getMessagesForThread(threadId);
        setMessages(m);
        if (t?.workflowId) {
          const wf = await getWorkflow(t.workflowId);
          if (wf) {
            setNodes(wf.nodes);
          }
        }
      }
    }
    void loadData();
  }, [threadId]);

  useEffect(() => {
    if (threadId) {
      void getMessagesForThread(threadId).then(setMessages);
    }
  }, [threadId, state.context.currentThreadId]);

  const handleOpenSettings = () => setShowSettings(true);
  const handleCloseSettings = () => setShowSettings(false);

  const handleOpenPayloadPreview = () => {
    const initialAgentId = state.context.activeWorkflowId || nodes[0]?.id || null;
    setPreviewAgentId(initialAgentId);
    setShowPayloadPreview(true);
  };

  useEffect(() => {
    if (showPayloadPreview && previewAgentId) {
      const agent = nodes.find((n) => n.id === previewAgentId);
      if (agent && agent.type === "agent") {
        const workflowInjected =
          thread?.workflowSnapshot && typeof thread.workflowSnapshot === "object"
            ? (thread.workflowSnapshot as Record<string, unknown>).injectedSystemMessages || []
            : [];
        const payload = compilePayloadForAgent(
          agent,
          messages as any,
          globalInjectedMessages,
          workflowInjected as any,
        );
        setPreviewPayload(payload);
      } else {
        setPreviewPayload(null);
      }
    }
  }, [showPayloadPreview, previewAgentId, nodes, messages, globalInjectedMessages, thread]);

  return (
    <>
      <Header aria-label="LLM Chat Thread">
        <HeaderName href="#" prefix="Chat">
          {!thread && (state.value as Record<string, unknown>).ViewState === "initializing"
            ? "Loading..."
            : !thread
              ? "Thread Not Found"
              : thread?.title || "Loading..."}
        </HeaderName>
        <HeaderGlobalBar>
          <Button
            kind="ghost"
            size="sm"
            onClick={handleOpenPayloadPreview}
            disabled={(state.value as Record<string, unknown>).ExecutionState === "executing"}
          >
            Preview API Payload
          </Button>
          <Dropdown
            id="preset-switcher"
            label="Active Preset"
            titleText={activePresetName}
            items={presets.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(data: unknown) =>
              send({
                type: "SWITCH_PRESET",
                presetId: (data as { target: { value: string } }).target.value,
              })
            }
          />
          <Button
            kind="ghost"
            size="sm"
            onClick={handleOpenSettings}
            renderIcon={Settings}
            style={{ marginLeft: "0.5rem" }}
          >
            Settings
          </Button>
        </HeaderGlobalBar>
      </Header>

      <Content style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 3rem)" }}>
        <ExecutionControlPanel state={state} send={send} />

        {/* Chat Feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <ChatFeed
              messages={messages}
              send={(event: unknown) => send(event as unknown as CoordinatorEvent)}
              currentThreadId={state.context.currentThreadId}
              draftAnswers={draftAnswers}
              budgetExceededCard={
                (state.value as Record<string, unknown>).ExecutionState ===
                  "awaitingHumanInput.budgetExceeded" && (
                  <BudgetExceededCard
                    budgetDetails={
                      state.context.loopControl.activeInterrupt?.budgetDetails || {
                        currentTokens: 0,
                        maxTokens: null,
                        stepCount: 0,
                      }
                    }
                    onIncreaseBudget={() => send({ type: "RESUME_WITH_BUDGET_OVERRIDE" })}
                    onAbort={() => send({ type: "CANCEL_EXECUTION" })}
                  />
                )
              }
              errorBubble={
                (state.value as Record<string, unknown>).ExecutionState === "error" && (
                  <ErrorBubble
                    errorMessage={state.context.errorMessage || "An unknown error occurred"}
                    presets={presets}
                    onRetry={() => send({ type: "RETRY_STEP" })}
                    onDismiss={() => send({ type: "DISMISS_ERROR" })}
                    onChangePreset={(presetId) =>
                      send({ type: "CHANGE_PRESET_AND_RESUME", presetId })
                    }
                    onEditResubmit={() => {
                      // Focus/scroll to last message logic
                      // For now, we can just log it or implement a simple scroll
                      console.log("Edit & Resubmit clicked");
                    }}
                  />
                )
              }
            />
          </div>
        </div>

        {/* Chat Input Area */}
        <ChatInputArea parentState={state} parentSend={send} />
      </Content>

      {thread && (
        <ThreadSettingsModal
          isOpen={showSettings}
          onClose={handleCloseSettings}
          threadId={thread.id}
          initialTitle={thread.title}
          initialPresetId={thread.activePresetId}
          presets={presets}
          onSaveSuccess={() => {
            // Refresh thread data
            void getThread(thread.id).then(setThread);
          }}
        />
      )}

      <ApiPayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        agents={nodes.filter((n) => n.type === "agent").map((n) => ({ id: n.id, name: n.name }))}
        initialAgentId={previewAgentId}
        payload={previewPayload}
      />
    </>
  );
}
