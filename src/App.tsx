import { useEffect } from "react";
import { useLocation, Routes, Route } from "react-router";
import { useMachine } from "@xstate/react";
import { Theme, Header, HeaderName, HeaderGlobalBar, Content, Button } from "@carbon/react";
import { Menu, Settings } from "@carbon/icons-react";
import { useCoordinator } from "./context/CoordinatorContext";
import { NewChatForm } from "./ui/sidebar/NewChatForm.js";
import { LeftSidebar } from "./ui/sidebar/LeftSidebar.js";
import { ChatInterface } from "./ui/chat/ChatInterface";
import { layoutMachine } from "./ui/layoutMachine";

export function App() {
  const { send } = useCoordinator();
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
          <Routes>
            <Route path="/:threadId" element={<ChatInterface />} />
            <Route path="*" element={<NewChatForm />} />
          </Routes>
        </main>
      </Content>
    </Theme>
  );
}
