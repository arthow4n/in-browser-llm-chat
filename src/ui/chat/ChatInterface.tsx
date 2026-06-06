import React, { useState } from "react";
import { useParams } from "react-router";
import { useMachine } from "@xstate/react";
import { Header, HeaderName, HeaderGlobalBar, Content, Button, TextInput } from "@carbon/react";
import { Settings, Send } from "@carbon/icons-react";
import { parentCoordinatorMachine } from "../../workflow/parentCoordinator";
import { ThreadSettingsModal } from "./ThreadSettingsModal";
import { getAllPresets, getThread, type PresetStore, type ThreadStore } from "../../db/db";

export function ChatInterface() {
  const { threadId } = useParams();
  const [state] = useMachine(parentCoordinatorMachine);
  const [showSettings, setShowSettings] = useState(false);
  const [presets, setPresets] = useState<PresetStore[]>([]);
  const [thread, setThread] = useState<ThreadStore | undefined | null>(null);

  React.useEffect(() => {
    async function loadData() {
      const p = await getAllPresets();
      setPresets(p);
      if (threadId) {
        const t = await getThread(threadId);
        setThread(t);
      }
    }
    void loadData();
  }, [threadId]);

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

        {/* Chat Feed Placeholder */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <p>Chat messages will appear here...</p>
          </div>
        </div>

        {/* Chat Input Area Placeholder */}
        <div style={{ padding: "1rem", borderTop: "1px solid #ddd" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", gap: "0.5rem" }}>
            <TextInput
              id="chat-input"
              labelText="Message"
              placeholder="Type your message..."
              style={{ flex: 1 }}
            />
            <Button renderIcon={Send} onClick={() => {}}>
              Send
            </Button>
          </div>
        </div>
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
