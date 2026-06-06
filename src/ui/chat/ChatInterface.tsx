import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useMachine } from "@xstate/react";
import { Header, HeaderName, HeaderGlobalBar, Content, Button } from "@carbon/react";
import { Settings } from "@carbon/icons-react";
import { parentCoordinatorMachine } from "../../workflow/parentCoordinator";
import { ThreadSettingsModal } from "./ThreadSettingsModal";
import { ChatInputArea } from "./ChatInputArea";
import { ChatFeed } from "../ChatFeed";
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
        {/* Execution Control Panel Placeholder */}
        <div
          style={{
            padding: "0.5rem",
            background: "#f4f4f4",
            borderBottom: "1px solid #ddd",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <strong>Status: {JSON.stringify(state.value)}</strong>
          <Button size="sm" disabled={state.value === "executing"}>
            Pause
          </Button>
          <Button size="sm" disabled={state.value !== "inactive"}>
            Resume
          </Button>
        </div>

        {/* Chat Feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <ChatFeed
              messages={messages}
              send={(event: unknown) => send(event as unknown as CoordinatorEvent)}
              currentThreadId={state.context.currentThreadId}
              draftAnswers={draftAnswers}
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
