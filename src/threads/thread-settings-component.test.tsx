import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { ThreadSettingsComponent } from "./thread-settings-component";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, savePreset, getThread } from "../db/db-operations";
import { saveWorkflow } from "../workflows/workflows-service";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Preset, Thread, Workflow } from "../db/db-schema";

describe("ThreadSettingsComponent UI", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

  const mockPresets: Preset[] = [
    {
      id: "a2f463ce-f834-c939-f467-b83887ff66e2", // valid UUID
      name: "Default Preset",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 5, maxTokensPerRun: null },
    },
  ];

  const mockWorkflow: Workflow = {
    id: "wf-1",
    name: "My Workflow",
    description: "Simple workflow",
    isBuiltIn: false,
    nodes: [{ id: "node-1", type: "agent", name: "Agent 1", systemPrompt: "Hello" }],
    edges: [],
  };

  const mockThread: Thread = {
    id: "thread-123",
    title: "Old Title",
    workflowId: "wf-1",
    workflowSnapshot: mockWorkflow,
    activePresetId: "a2f463ce-f834-c939-f467-b83887ff66e2",
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
  };

  beforeAll(async () => {
    resetDBConnection();
    db = await getDB();
  });

  afterAll(async () => {
    if (db) {
      db.close();
    }
    resetDBConnection();
  });

  beforeEach(async () => {
    for (const name of Array.from(db!.objectStoreNames)) {
      await db!.clear(name);
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("should render modal with thread details, handle title edit, and allow saving settings", async () => {
    await savePreset(mockPresets[0]);
    await saveWorkflow(mockWorkflow);
    await saveThread(mockThread);

    const handleClose = vi.fn<() => void>();
    const handleSaveSuccess = vi.fn<() => void>();

    render(
      <ThreadSettingsComponent
        threadId="thread-123"
        isOpen={true}
        onClose={handleClose}
        onSaveSuccess={handleSaveSuccess}
      />,
    );

    // Modal should be in the document
    await waitFor(() => {
      expect(screen.getByTestId("thread-settings-modal")).toBeInTheDocument();
    });

    expect(screen.getByText("Old Title")).toBeInTheDocument();

    // Trigger Title Edit Mode
    const editBtn = screen.getByLabelText("Edit title");
    fireEvent.click(editBtn);

    const titleInput = screen.getByLabelText("Thread Title");
    fireEvent.change(titleInput, { target: { value: "New Title 2026" } });

    const saveBtn = screen.getByTestId("save-thread-settings-btn");
    fireEvent.click(saveBtn);

    await waitFor(async () => {
      const updated = await getThread("thread-123");
      expect(updated?.title).toBe("New Title 2026");
    });
  });

  it("can perform workflow syncing successfully", async () => {
    await savePreset(mockPresets[0]);
    await saveWorkflow(mockWorkflow);
    await saveThread(mockThread);

    const changedWorkflow: Workflow = {
      ...mockWorkflow,
      nodes: [{ id: "node-1", type: "agent", name: "Agent 1", systemPrompt: "Hello modified!" }],
    };

    // Update master workflow in db
    await saveWorkflow(changedWorkflow);

    render(
      <ThreadSettingsComponent threadId="thread-123" isOpen={true} onClose={vi.fn<() => void>()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sync-workflow-btn")).toBeInTheDocument();
    });

    const syncBtn = screen.getByTestId("sync-workflow-btn");
    fireEvent.click(syncBtn);

    // Should prompt soft sync
    await waitFor(() => {
      expect(screen.getByTestId("soft-sync-prompt")).toBeInTheDocument();
    });

    const confirmSoftBtn = screen.getByTestId("confirm-soft-sync-btn");
    fireEvent.click(confirmSoftBtn);

    await waitFor(() => {
      expect(screen.getByTestId("sync-success-alert")).toBeInTheDocument();
    });
  });
});
