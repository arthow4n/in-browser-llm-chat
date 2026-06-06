import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { LeftSidebar } from "./LeftSidebar.tsx";
import { closeDB, saveThread, resetDBPromise, type WorkflowStore } from "../../db/db.ts";
import "fake-indexeddb/auto";

const mockWorkflow: WorkflowStore = {
  id: "wf-1",
  name: "Mock Workflow",
  description: "Mock Description",
  isBuiltIn: false,
  nodes: [],
  edges: [],
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;
globalThis.ResizeObserver = ResizeObserverMock;
if (typeof window !== "undefined") {
  window.ResizeObserver = ResizeObserverMock;
}

describe("LeftSidebar Component Integration", () => {
  beforeEach(async () => {
    // Reset database
    await closeDB();
    resetDBPromise();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("in-browser-llm-chat-db");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Seed a couple of threads
    await saveThread({
      id: "thread-1",
      title: "First Thread Query",
      workflowId: "w1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "p1",
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });
    await saveThread({
      id: "thread-2",
      title: "Second Thread",
      workflowId: "w1",
      workflowSnapshot: mockWorkflow,
      activePresetId: "p1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });
  });

  afterEach(async () => {
    cleanup();
    await closeDB();
  });

  it("should render list of threads and support navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/thread-1"]}>
        <Routes>
          <Route path="/:threadId" element={<LeftSidebar />} />
          <Route path="/" element={<LeftSidebar />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for the threads to load and display
    await waitFor(() => {
      expect(screen.getByText("Second Thread")).toBeTruthy();
    });
    expect(screen.getByText("First Thread Query")).toBeTruthy();

    // Check that clicking a thread triggers navigation (or highlights it)
    const secondThreadItem = screen.getByText("Second Thread");
    fireEvent.click(secondThreadItem);
  });

  it("should filter threads when search input is typed in", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <LeftSidebar />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Second Thread")).toBeTruthy();
    });

    const searchInput = screen.getAllByPlaceholderText("Search chats...")[0];
    fireEvent.change(searchInput, { target: { value: "Query" } });

    await waitFor(() => {
      expect(screen.queryByText("Second Thread")).toBeNull();
      expect(screen.getByText("First Thread Query")).toBeTruthy();
    });
  });
});
