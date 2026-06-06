import { useEffect } from "react";
import { useParams } from "react-router";
import { useMachine } from "@xstate/react";
import { useCoordinator } from "../../context/CoordinatorContext";
import { Header, HeaderName, HeaderGlobalBar, Content, Button, Dropdown } from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import { type CoordinatorEvent } from "../../workflow/parentCoordinator";
import { chatInterfaceDisplayMachine } from "./chatInterfaceDisplayMachine";
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
} from "../../db/db";

export function ChatInterface() {
  const { threadId } = useParams();
  const { state, send } = useCoordinator();
  const [displayState, sendDisplay] = useMachine(chatInterfaceDisplayMachine);

  const showSettings = displayState.context.showSettings;
  const showPayloadPreview = displayState.context.showPayloadPreview;
  const previewAgentId = displayState.context.previewAgentId;
  const previewPayload = displayState.context.previewPayload;
  const thread = displayState.context.thread;
  const messages = displayState.context.messages;
  const draftAnswers = displayState.context.draftAnswers;
  const presets = displayState.context.presets;
  const nodes = displayState.context.nodes;
  const globalInjectedMessages = displayState.context.globalInjectedMessages;

  const activePreset = presets.find((p) => p.id === state.context.activePresetId);
  const activePresetName = activePreset?.name || "No preset selected";

  useEffect(() => {
    async function loadData() {
      const p = await getAllPresets();
      sendDisplay({ type: "SET_PRESETS", presets: p });
      const injected = await getSetting<Array<{ content: string; depth: number }>>(
        "injected_system_messages",
      );
      sendDisplay({ type: "SET_GLOBAL_INJECTED_MESSAGES", messages: injected || [] });
      if (threadId) {
        const t = await getThread(threadId);
        sendDisplay({ type: "SET_THREAD", thread: t });
        sendDisplay({ type: "SET_DRAFT_ANSWERS", draftAnswers: t?.draftAnswers || {} });
        const m = await getMessagesForThread(threadId);
        sendDisplay({ type: "SET_MESSAGES", messages: m });
        if (t?.workflowId) {
          const wf = await getWorkflow(t.workflowId);
          if (wf) {
            sendDisplay({ type: "SET_NODES", nodes: wf.nodes });
          }
        }
      }
    }
    void loadData();
  }, [threadId, sendDisplay]);

  useEffect(() => {
    if (threadId) {
      void getMessagesForThread(threadId).then((m) => {
        sendDisplay({ type: "SET_MESSAGES", messages: m });
      });
    }
  }, [threadId, state.context.currentThreadId, sendDisplay]);

  const handleOpenSettings = () => sendDisplay({ type: "OPEN_SETTINGS" });
  const handleCloseSettings = () => sendDisplay({ type: "CLOSE_SETTINGS" });

  const handleOpenPayloadPreview = () => {
    const initialAgentId = state.context.activeWorkflowId || nodes[0]?.id || null;
    sendDisplay({ type: "OPEN_PAYLOAD_PREVIEW", initialAgentId });
  };

  useEffect(() => {
    if (showPayloadPreview && previewAgentId) {
      const agent = nodes.find((n) => n.id === previewAgentId);
      if (agent && agent.type === "agent") {
        const workflowInjected = thread?.workflowSnapshot?.injectedSystemMessages || [];
        const payload = compilePayloadForAgent(
          agent,
          messages,
          globalInjectedMessages,
          workflowInjected,
        );
        sendDisplay({ type: "SET_PREVIEW_PAYLOAD", payload });
      } else {
        sendDisplay({ type: "SET_PREVIEW_PAYLOAD", payload: null });
      }
    }
  }, [
    showPayloadPreview,
    previewAgentId,
    nodes,
    messages,
    globalInjectedMessages,
    thread,
    sendDisplay,
  ]);

  return (
    <>
      <Header aria-label="LLM Chat Thread">
        <HeaderName href="#" prefix="Chat">
          {!thread && state.matches({ ViewState: "initializing" })
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
            disabled={state.matches({ ExecutionState: "executing" })}
          >
            Preview API Payload
          </Button>
          <Dropdown
            id="preset-switcher"
            label="Active Preset"
            titleText={activePresetName}
            items={presets.map((p) => ({ id: p.id, label: p.name }))}
            onChange={({ selectedItem }: { selectedItem?: { id: string } | null }) => {
              if (selectedItem) {
                send({
                  type: "SWITCH_PRESET",
                  presetId: selectedItem.id,
                });
              }
            }}
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
              send={(event: CoordinatorEvent) => send(event)}
              currentThreadId={state.context.currentThreadId}
              draftAnswers={draftAnswers}
              budgetExceededCard={
                state.matches({ ExecutionState: { awaitingHumanInput: "budgetExceeded" } }) && (
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
                state.matches({ ExecutionState: "error" }) && (
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
                      // TODO: implement a simple scroll
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
            void getThread(thread.id).then((t) => {
              sendDisplay({ type: "SET_THREAD", thread: t });
            });
          }}
        />
      )}

      <ApiPayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => sendDisplay({ type: "CLOSE_PAYLOAD_PREVIEW" })}
        agents={nodes.filter((n) => n.type === "agent").map((n) => ({ id: n.id, name: n.name }))}
        initialAgentId={previewAgentId}
        payload={previewPayload}
      />
    </>
  );
}
