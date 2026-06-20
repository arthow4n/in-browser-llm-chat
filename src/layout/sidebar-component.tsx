import { NavLink } from "react-router";
import type { Thread } from "../db/db-schema";

interface SidebarComponentProps {
  threads: Thread[];
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onNewChat?: () => void;
  onDeleteThread?: (id: string) => void;
}

export function SidebarComponent({
  threads,
  isMobileOpen,
  onCloseMobile,
  onNewChat,
  onDeleteThread,
}: SidebarComponentProps) {
  return (
    <aside
      className={`app-sidebar ${isMobileOpen ? "mobile-open" : ""}`}
      data-testid="app-sidebar"
      aria-label="Sidebar Navigation"
    >
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">💬</span>
          <span className="logo-text">LLM Chat</span>
        </div>
        <button
          type="button"
          className="mobile-close-btn"
          onClick={onCloseMobile}
          aria-label="Close menu"
          data-testid="sidebar-close-btn"
        >
          ✕
        </button>
      </div>

      <div className="sidebar-actions">
        <button
          type="button"
          className="new-chat-btn"
          onClick={onNewChat}
          data-testid="new-chat-btn"
        >
          <span className="btn-icon">＋</span> New Chat
        </button>
      </div>

      <nav className="sidebar-threads" aria-label="Conversation History">
        <span className="sidebar-section-title">Recent Chats</span>
        {threads.length === 0 ? (
          <div className="threads-empty-state" data-testid="threads-empty-state">
            No conversations yet
          </div>
        ) : (
          <ul className="threads-list">
            {threads.map((thread) => (
              <li key={thread.id} className="thread-item-wrapper">
                <NavLink
                  to={`/threads/${thread.id}`}
                  className={({ isActive }) => `thread-link ${isActive ? "active" : ""}`}
                  onClick={onCloseMobile}
                  data-testid={`thread-link-${thread.id}`}
                >
                  <span className="thread-icon">✉</span>
                  <span className="thread-title-text">{thread.title || "Untitled Chat"}</span>
                </NavLink>
                {onDeleteThread && (
                  <button
                    type="button"
                    className="thread-delete-action-btn"
                    onClick={() => onDeleteThread(thread.id)}
                    aria-label={`Delete ${thread.title || "Untitled Chat"}`}
                    data-testid={`delete-thread-btn-${thread.id}`}
                  >
                    🗑
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="sidebar-footer">
        <NavLink
          to="/presets"
          className={({ isActive }) => `sidebar-footer-link ${isActive ? "active" : ""}`}
          onClick={onCloseMobile}
          data-testid="presets-nav-link"
        >
          <span className="footer-icon">⚙</span>
          <span>LLM Presets</span>
        </NavLink>
        <NavLink
          to="/workflows"
          className={({ isActive }) => `sidebar-footer-link ${isActive ? "active" : ""}`}
          onClick={onCloseMobile}
          data-testid="workflows-nav-link"
        >
          <span className="footer-icon">🔄</span>
          <span>Agent Workflows</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-footer-link ${isActive ? "active" : ""}`}
          onClick={onCloseMobile}
          data-testid="settings-nav-link"
        >
          <span className="footer-icon">👤</span>
          <span>Global Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
