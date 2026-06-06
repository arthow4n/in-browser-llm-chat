import React, { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { useParams, useNavigate } from "react-router";
import { Search, Button, Modal, Loading, SkeletonText } from "@carbon/react";

import { Add, TrashCan } from "@carbon/icons-react";
import { leftSidebarMachine } from "./leftSidebarMachine.js";

export const LeftSidebar: React.FC = () => {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const [state, send] = useMachine(leftSidebarMachine);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { threads, searchQuery, activeThreadId, deletingThreadId, hasMore, errorMessage } =
    state.context;

  // Sync route param threadId with machine's activeThreadId
  useEffect(() => {
    send({ type: "SET_ACTIVE_THREAD", threadId: threadId || null });
  }, [threadId, send]);

  // If a new thread is set active but not present in the threads list, reload list
  useEffect(() => {
    if (threadId && !threads.some((t) => t.id === threadId)) {
      send({ type: "LOAD_INITIAL_THREADS" });
    }
  }, [threadId, threads, send]);

  // Handle scroll for infinite page-based loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
    if (isNearBottom && hasMore && state.matches("idle")) {
      send({ type: "LOAD_MORE" });
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    send({ type: "FILTER_THREADS", query: e.target.value });
  };

  const handleClearSearch = () => {
    send({ type: "FILTER_THREADS", query: "" });
  };

  const handleNewChat = () => {
    void navigate("/");
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    send({ type: "TRIGGER_DELETE", threadId: id });
  };

  const handleConfirmDelete = () => {
    // Navigate away first if the active thread is being deleted
    if (deletingThreadId === threadId) {
      // Find another thread if possible
      const remaining = threads.filter((t) => t.id !== deletingThreadId && t.status !== "deleting");
      if (remaining.length > 0) {
        void navigate(`/${remaining[0].id}`);
      } else {
        void navigate("/");
      }
    }
    send({ type: "CONFIRM_DELETE" });
  };

  const handleCancelDelete = () => {
    send({ type: "CANCEL_DELETE" });
  };

  const isLoadingInitial = state.matches("loadingInitial");
  const isLoadingMore = state.matches("loadingMore");
  const isConfirmingDelete = state.matches("confirmingDelete");
  const isDeleting = state.matches("deleting");

  const renderSkeletons = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {[...Array(10)].map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            gap: "0.5rem",
          }}
        >
          <SkeletonText width="70%" />
          <SkeletonText width="2rem" />
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        width: "300px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#161616",
        borderRight: "1px solid #393939",
        color: "#f4f4f4",
      }}
    >
      {/* Top Panel Actions */}
      <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Button
          renderIcon={Add}
          iconDescription="New Chat"
          kind="primary"
          onClick={handleNewChat}
          disabled={isLoadingInitial || isDeleting}
          style={{ width: "100%", justifyContent: "space-between" }}
        >
          New Chat
        </Button>
        <Search
          size="md"
          labelText="Search Chats"
          placeholder="Search chats..."
          value={searchQuery}
          onChange={handleSearch}
          onClear={handleClearSearch}
          disabled={isLoadingInitial || isDeleting}
        />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div style={{ padding: "0.5rem 1rem", color: "#da1e28", fontSize: "0.875rem" }}>
          {errorMessage}
        </div>
      )}

      {/* Thread List Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isLoadingInitial ? (
          <div style={{ padding: "1rem" }}>{renderSkeletons()}</div>
        ) : threads.length === 0 ? (
          <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#8d8d8d" }}>
            No chats found
          </div>
        ) : (
          threads
            .filter((t) => t.status !== "deleting")
            .map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <div
                  key={thread.id}
                  onClick={() => navigate(`/${thread.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    backgroundColor: isActive ? "#393939" : "transparent",
                    borderLeft: isActive ? "4px solid #0f62fe" : "4px solid transparent",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = "#262626";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "0.875rem",
                      fontWeight: isActive ? "600" : "400",
                      color: isActive ? "#ffffff" : "#c6c6c6",
                    }}
                  >
                    {thread.title || "Untitled Chat"}
                  </span>
                  <Button
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription="Delete Chat"
                    tooltipPosition="left"
                    kind="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteClick(e, thread.id)}
                    disabled={isDeleting}
                    style={{
                      color: "#da1e28",
                      minHeight: "auto",
                      padding: "4px",
                    }}
                  />
                </div>
              );
            })
        )}

        {/* Load More Indicator */}
        {isLoadingMore && (
          <div style={{ padding: "1rem", display: "flex", justifyContent: "center" }}>
            <Loading withOverlay={false} small />
          </div>
        )}
      </div>

      <Modal
        open={isConfirmingDelete || isDeleting}
        modalHeading="Delete Chat"
        primaryButtonText="Delete"
        secondaryButtonText={isDeleting ? undefined : "Cancel"}
        danger
        onRequestClose={isDeleting ? () => {} : handleCancelDelete}
        onRequestSubmit={handleConfirmDelete}
        primaryButtonDisabled={isDeleting}
      >
        <p>Are you sure you want to delete this chat thread? This action cannot be undone.</p>
        {isDeleting && (
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Loading withOverlay={false} small />
            <span>Deleting thread and checkpoints...</span>
          </div>
        )}
      </Modal>
    </div>
  );
};
