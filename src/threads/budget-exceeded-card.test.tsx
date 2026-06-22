import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread, getThread } from "../db/db-operations";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import type { Thread } from "../db/db-schema";
import { BudgetExceededCard } from "./budget-exceeded-card";

describe("BudgetExceededCard UI Component", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;
  const threadId = "99999999-9999-9999-9999-999999999999";

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
    const storeNames = Array.from(db!.objectStoreNames);
    for (const name of storeNames) {
      await db!.clear(name);
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("should render the budget exceeded details, call increase budget transaction on resume click, and trigger onSuccess callback", async () => {
    const thread: Thread = {
      id: threadId,
      title: "Test Thread",
      workflowId: "test-wf",
      workflowSnapshot: {},
      activePresetId: "44444444-4444-4444-4444-444444444444",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: {
        type: "budget_exceeded",
        budgetDetails: {
          currentTokens: 120,
          maxTokens: 100,
          stepCount: 3,
        },
      },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    };
    await saveThread(thread);

    const onSuccessSpy = vi.fn<() => void>();

    render(
      <BudgetExceededCard
        threadId={threadId}
        currentTokens={120}
        maxTokens={100}
        stepCount={3}
        onSuccess={onSuccessSpy}
      />,
    );

    expect(screen.getByTestId("budget-exceeded-card")).toBeInTheDocument();
    expect(screen.getByText(/Steps Run:/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("120 / 100")).toBeInTheDocument();

    const resumeBtn = screen.getByTestId("budget-resume-btn");
    fireEvent.click(resumeBtn);

    await waitFor(() => {
      expect(onSuccessSpy).toHaveBeenCalled();
    });

    const updatedThread = await getThread(threadId);
    expect(updatedThread?.status).toBe("executing");
    expect(updatedThread?.activeInterrupt).toBeNull();

    // Renders the read-only resolved state
    expect(screen.getByText("Resumed")).toBeInTheDocument();
  });

  it("should render read-only state directly if isResolved is true", () => {
    render(
      <BudgetExceededCard
        threadId={threadId}
        currentTokens={120}
        maxTokens={100}
        stepCount={3}
        isResolved={true}
        resolutionStatus="aborted"
      />,
    );

    expect(screen.getByText("Aborted")).toBeInTheDocument();
    expect(screen.queryByTestId("budget-resume-btn")).not.toBeInTheDocument();
  });
});
