import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useMachine } from "@xstate/react";
import { Header, HeaderName, HeaderGlobalBar, Content, Button } from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import { parentCoordinatorMachine } from "../../workflow/parentCoordinator";
import { ThreadSettingsModal } from "./ThreadSettingsModal";
import { ExecutionControlPanel } from "./ExecutionControlPanel";
import { ChatInputArea } from "./ChatInputArea";
import { ChatFeed } from "../ChatFeed";
import { BudgetExceededCard } from "../BudgetExceededCard";
import { ErrorBubble } from "../ErrorBubble";
import {
  getAllPresets,
  getThread,
  getMessagesForThread,
  type PresetStore,
  type ThreadStore,
  type MessageStore,
} from "../../db/db";
import { type CoordinatorEvent } from "../../workflow/parentCoordinator";

export function ChatInterface() {
  const { threadId } = useParams();
  const [state, send] = useMachine(parentCoordinatorMachine);
  const [showSettings, setShowSettings] = useState(false);
  const [presets, setPresets] = useState<PresetStore[]>([]);
  const [thread, setThread] = useState<ThreadStore | undefined | null>(null);
  const [messages, setMessages] = useState<MessageStore[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    async function loadData() {
      const p = await getAllPresets();
      setPresets(p);
      if (threadId) {
        const t = await getThread(threadId);
        setThread(t);
        setDraftAnswers(t?.draftAnswers || {});
        const m = await getMessagesForThread(threadId);
        setMessages(m);
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

  return (
    <>
      <Header aria-label="LLM Chat Thread">
        <HeaderName href="#" prefix="Chat">
          {thread?.title || "Loading..."}
        </HeaderName>
        <HeaderGlobalBar>
          <Button kind="ghost" size="sm" onClick={handleOpenSettings} renderIcon={Settings}>
            Thread Settings
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
                (state.value as Record<string, unknown>).ExecutionState === "awaitingHumanInput.budgetExceeded" && (
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
    </>
  );
}
