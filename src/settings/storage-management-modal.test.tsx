import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { SettingsComponent } from "./settings-component";

describe("StorageManagementModal Integration Tests", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

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

  let reloadMock = vi.fn<() => void>();

  beforeEach(async () => {
    const storeNames = Array.from(db!.objectStoreNames);
    for (const name of storeNames) {
      await db!.clear(name);
    }
    reloadMock = vi.fn<() => void>();
    vi.stubGlobal("location", { reload: reloadMock });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens modal and displays storage metrics & thread list", async () => {
    // Seed database with some threads
    const now = Date.now();
    await db!.put("threads", {
      id: "thread-1",
      title: "Test Chat 1",
      workflowId: "std",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: now,
      updatedAt: now,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    render(<SettingsComponent />);

    // Wait for settings component to load
    await waitFor(() => {
      expect(screen.getByTestId("manage-storage-btn")).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByTestId("manage-storage-btn"));

    // Verify modal is open and skeleton shows first or directly goes to loaded state
    expect(screen.getByTestId("storage-management-modal")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("storage-usage-display")).toBeInTheDocument();
    });

    expect(screen.getByText("Test Chat 1")).toBeInTheDocument();
    expect(screen.getByText("300 tokens")).toBeInTheDocument();
  });

  it("handles bulk deletion of selected threads", async () => {
    const now = Date.now();
    await db!.put("threads", {
      id: "thread-del-1",
      title: "Thread to Delete",
      workflowId: "std",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: now,
      updatedAt: now,
      parentThreadId: null,
      parentMessageId: null,
      status: "inactive",
      activeInterrupt: null,
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
    });

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("manage-storage-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("manage-storage-btn"));

    await waitFor(() => {
      expect(screen.getByText("Thread to Delete")).toBeInTheDocument();
    });

    // Row selection (clicking row toggles checkbox)
    fireEvent.click(screen.getByTestId("thread-row-thread-del-1"));

    const bulkDelBtn = screen.getByTestId("bulk-delete-btn");
    expect(bulkDelBtn).toHaveTextContent("Delete Selected (1)");

    fireEvent.click(bulkDelBtn);

    // After bulk deletion, thread list should reload and be empty
    await waitFor(() => {
      expect(screen.queryByText("Thread to Delete")).not.toBeInTheDocument();
    });

    // Check IndexedDB state
    const remainingThreads = await db!.getAll("threads");
    expect(remainingThreads).toHaveLength(0);
  });

  it("performs factory reset after user types RESET", async () => {
    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("manage-storage-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("manage-storage-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("factory-reset-btn")).toBeInTheDocument();
    });

    // Click factory reset
    fireEvent.click(screen.getByTestId("factory-reset-btn"));

    // Warn box should render
    expect(screen.getByTestId("factory-reset-confirmation")).toBeInTheDocument();

    const confirmBtn = screen.getByTestId("confirm-factory-reset-btn");
    expect(confirmBtn).toBeDisabled();

    // Type wrong string
    const input = screen.getByTestId("confirm-reset-input");
    fireEvent.change(input, { target: { value: "REST" } });
    expect(confirmBtn).toBeDisabled();

    // Type RESET
    fireEvent.change(input, { target: { value: "RESET" } });
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm
    fireEvent.click(confirmBtn);

    // Verify reload was triggered
    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });
  });
});
