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

  // Navigate to newly created thread once layoutMachine finishes creation
  useEffect(() => {
    if (state.context.newCreatedThreadId) {
      const targetId = state.context.newCreatedThreadId;
      send({ type: "CLEAR_NEW_THREAD_ID" });
      void navigate(`/threads/${targetId}`);
    }
  }, [state.context.newCreatedThreadId, send, navigate]);

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
    send({ type: "CREATE_THREAD" });
  };

  const handleDeleteThread = (id: string) => {
    const isDeletingActive = threadId === id;
    if (
      confirm(
        "Are you sure you want to delete this conversation? This will permanently delete all messages and history.",
      )
    ) {
      send({ type: "DELETE_THREAD", id });
      if (isDeletingActive) {
        void navigate("/settings");
      }
    }
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
