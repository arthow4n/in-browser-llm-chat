import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { Outlet, useParams, useLocation, useNavigate } from "react-router";
import { layoutMachine } from "./layout-machine";
import { SidebarComponent } from "./sidebar-component";
import { HeaderComponent } from "./header-component";

export function LayoutComponent() {
  const [state, send] = useMachine(layoutMachine);
  const { threadId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Refresh thread list when route changes to reload latest threads
  useEffect(() => {
    send({ type: "REFRESH_THREADS" });
  }, [location.pathname, send]);

  const activeThread = threadId ? state.context.threads.find((t) => t.id === threadId) : undefined;

  let title = "In-Browser LLM Chat";
  if (location.pathname.startsWith("/settings")) {
    title = "Global Settings";
  } else if (location.pathname.startsWith("/presets")) {
    title = "LLM Presets";
  } else if (threadId) {
    title = activeThread?.title || "Untitled Chat";
  }

  const handleNewChat = () => {
    // In Step 2.2 we will implement full thread creation. For now, navigate to thread route if needed
    // or log/do nothing. Let's navigate to /threads/new or trigger callback if needed.
    // Let's add a placeholder navigation or trigger.
    void navigate("/threads/new-placeholder");
  };

  const handleDeleteThread = (id: string) => {
    // In Step 2.2 we will implement full thread deletion.
    console.log("Delete thread requested:", id);
  };

  return (
    <div className="app-layout" data-testid="app-layout">
      <SidebarComponent
        threads={state.context.threads}
        isMobileOpen={state.context.isMobileOpen}
        onCloseMobile={() => send({ type: "CLOSE_MOBILE_SIDEBAR" })}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
      />
      <div className="layout-main-wrapper">
        <HeaderComponent
          title={title}
          onToggleMobileSidebar={() => send({ type: "TOGGLE_MOBILE_SIDEBAR" })}
        />
        <main className="layout-content-region" data-testid="layout-content-region">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
