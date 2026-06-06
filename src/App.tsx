import { useEffect } from "react";
import { useLocation, Routes, Route } from "react-router";
import { useMachine } from "@xstate/react";
import { Theme, Header, HeaderName, HeaderGlobalBar, Content } from "@carbon/react";
import { parentCoordinatorMachine } from "./workflow/parentCoordinator";
import { NewChatForm } from "./ui/sidebar/NewChatForm.js";
import { LeftSidebar } from "./ui/sidebar/LeftSidebar.js";
import { ChatInterface } from "./ui/chat/ChatInterface";

export function App() {
  const [, send] = useMachine(parentCoordinatorMachine);
  const location = useLocation();

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
          Chat
        </HeaderName>
        <HeaderGlobalBar>{/* Settings and other global actions will go here */}</HeaderGlobalBar>
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
        <LeftSidebar />
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
