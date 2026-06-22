import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProposalComponent } from "./proposal-component";
import { ProposalComponentProps } from "./proposal-component";
import * as dbConn from "../db/db-connection";

vi.mock("../db/db-connection", () => {
  const mockPut = vi.fn<() => Promise<void>>();
  const mockGet = vi.fn<() => Promise<unknown>>();
  const mockIndex = vi.fn<() => unknown>(() => ({
    openCursor: vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
  }));
  const mockStore = {
    get: mockGet,
    put: mockPut,
    index: mockIndex,
  };
  const mockTx = {
    objectStore: vi.fn<() => unknown>(() => mockStore),
    done: Promise.resolve(),
  };
  const mockDb = {
    transaction: vi.fn<() => unknown>(() => mockTx),
  };
  return {
    getDB: vi.fn<() => Promise<unknown>>().mockResolvedValue(mockDb),
  };
});

interface MockStore {
  get: unknown;
  put: unknown;
  index: unknown;
}

interface MockTx {
  objectStore: (name: string) => MockStore;
  done: Promise<void>;
}

interface MockDB {
  transaction: (storeNames: string | string[], mode?: string) => MockTx;
}

const defaultProps: ProposalComponentProps = {
  threadId: "thread-1",
  toolCallId: "call-1",
  toolName: "declare_consensus",
  proposalData: { topic: "test topic" },
};

describe("ProposalComponent", () => {
  it("renders the proposal card details and allows approval", async () => {
    const mockDb = (await dbConn.getDB()) as unknown as MockDB;
    const mockTx = mockDb.transaction("threads", "readonly");
    const mockStore = mockTx.objectStore("threads");
    vi.mocked(mockStore.get as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      id: "thread-1",
      title: "Test Thread",
      workflowId: "test-flow",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: { type: "approval", toolCallId: "call-1" },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });

    const onSuccess = vi.fn<() => void>();
    render(<ProposalComponent {...defaultProps} onSuccess={onSuccess} />);

    expect(screen.getByText("Proposal: declare_consensus")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Approval")).toBeInTheDocument();
    expect(screen.getByText(/test topic/)).toBeInTheDocument();

    const approveBtn = screen.getByTestId("approve-btn");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("allows rejection with a reason", async () => {
    const mockDb = (await dbConn.getDB()) as unknown as MockDB;
    const mockTx = mockDb.transaction("threads", "readonly");
    const mockStore = mockTx.objectStore("threads");
    vi.mocked(mockStore.get as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      id: "thread-1",
      title: "Test Thread",
      workflowId: "test-flow",
      workflowSnapshot: {},
      activePresetId: "preset-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: { type: "approval", toolCallId: "call-1" },
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });

    const onSuccess = vi.fn<() => void>();
    render(<ProposalComponent {...defaultProps} onSuccess={onSuccess} />);

    const rejectBtn = screen.getByTestId("reject-btn");
    fireEvent.click(rejectBtn);

    const inputWrapper = screen.getByTestId("rejection-input-wrapper");
    expect(inputWrapper).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Please enter a reason for rejection/);
    fireEvent.change(textarea, { target: { value: "Topic is not clear" } });

    const confirmBtn = screen.getByTestId("confirm-reject-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("renders read-only approved view correctly", () => {
    render(<ProposalComponent {...defaultProps} isApproved={true} />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-btn")).toBeNull();
  });

  it("renders read-only rejected view correctly with reason", () => {
    render(
      <ProposalComponent {...defaultProps} isRejected={true} rejectionReason="Not agreed yet" />,
    );
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/Not agreed yet/)).toBeInTheDocument();
  });
});
