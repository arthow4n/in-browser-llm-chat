import { useEffect } from "react";
import { useLocation, Routes, Route } from "react-router";
import { useMachine } from "@xstate/react";
import { Theme, Header, HeaderName, HeaderGlobalBar, Content, Button } from "@carbon/react";
import { Menu, Settings } from "@carbon/icons-react";
import { useCoordinator } from "./context/CoordinatorContext";
import { NewChatForm } from "./ui/sidebar/NewChatForm.js";
import { LeftSidebar } from "./ui/sidebar/LeftSidebar.js";
import { ChatInterface } from "./ui/chat/ChatInterface";
import { GlobalSettings } from "./ui/settings/GlobalSettings";
import { PresetConfig } from "./ui/settings/PresetConfig";
import { WorkflowList } from "./ui/workflow/WorkflowList";
import { WorkflowEditor } from "./ui/workflow/WorkflowEditor";
import { layoutMachine } from "./ui/layoutMachine";

export function App() {
  const { state, send } = useCoordinator();
  const [layoutState, sendLayout] = useMachine(layoutMachine);
  const location = useLocation();
  const isSidebarOpen = layoutState.matches("sidebarOpen");

  useEffect(() => {
    const pathname = location.pathname;
    let threadId: string | null = null;
    if (pathname.length > 1) {
      const match = pathname.match(/^\/([^/]+)$/);
      if (match) {
        threadId = match[1];
      }
    }
    send({ type: "ROUTE_CHANGED", threadId });
  }, [location, send]);

  return (
    <Theme theme="g100">
      <Header aria-label="LLM Chat">
        <HeaderName href="#" prefix="LLM">
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={Menu}
            onClick={() => sendLayout({ type: "TOGGLE_SIDEBAR" })}
            style={{ marginRight: "0.5rem" }}
          />
          Chat
        </HeaderName>
        <HeaderGlobalBar>
          <Button
            kind="ghost"
            hasIconOnly
            renderIcon={Settings}
            onClick={() => send({ type: "OPEN_SETTINGS" })}
          />
        </HeaderGlobalBar>
      </Header>
      <Content
        style={{
          display: "flex",
          flexDirection: "row",
          padding: 0,
          height: "calc(100vh - 3rem)",
          overflow: "hidden",
        }}
      >
        {isSidebarOpen && <LeftSidebar />}
        <main style={{ flex: 1, overflowY: "auto" }}>
          {state.matches({ ViewState: "globalSettings" }) && <GlobalSettings />}
          {state.matches({ ViewState: "presetConfig" }) && (
            <PresetConfig
              presetId={state.context.editingPresetId}
              onClose={() => send({ type: "CLOSE_PRESET_EDIT" })}
            />
          )}
          {state.matches({ ViewState: "workflowList" }) && (
            <WorkflowList
              onEditWorkflow={(id) => send({ type: "OPEN_WORKFLOW_EDIT", workflowId: id })}
              onCreateWorkflow={() => send({ type: "OPEN_WORKFLOW_EDIT", workflowId: null })}
            />
          )}
          {state.matches({ ViewState: "workflowConfig" }) && (
            <WorkflowEditor
              workflowId={state.context.editingWorkflowId}
              onClose={() => send({ type: "CLOSE_WORKFLOW_EDIT" })}
            />
          )}
          {!["globalSettings", "presetConfig", "workflowList", "workflowConfig"].some((view) =>
            state.matches({ ViewState: view }),
          ) && (
            <Routes>
              <Route path="/:threadId" element={<ChatInterface />} />
              <Route path="*" element={<NewChatForm />} />
            </Routes>
          )}
        </main>
      </Content>
    </Theme>
  );
}
