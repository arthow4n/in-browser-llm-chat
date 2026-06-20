import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LoopControlPanel } from "./loop-control-panel";

describe("LoopControlPanel UI Component", () => {
  const defaultProps = {
    workflowType: "loop" as const,
    currentRound: 1,
    turnCount: 0,
    tokenStats: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    executionState: "inactive" as const,
    hasCheckpoint: false,
    onPause: vi.fn<() => void>(),
    onResume: vi.fn<() => void>(),
    onAbort: vi.fn<() => void>(),
    onForceConsensus: vi.fn<() => void>(),
    onForceSummarize: vi.fn<() => void>(),
  };

  it("renders correctly with default props", () => {
    render(<LoopControlPanel {...defaultProps} />);
    expect(screen.getByTestId("loop-control-panel")).toBeInTheDocument();
    expect(screen.getByTestId("stat-round")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-turns")).toHaveTextContent("0");
  });

  it("enables and disables buttons based on executionState", () => {
    const { rerender } = render(<LoopControlPanel {...defaultProps} executionState="inactive" />);

    // Pause, Resume, Abort should be disabled by default (no checkpoint)
    expect(screen.getByTestId("panel-pause-btn")).toBeDisabled();
    expect(screen.getByTestId("panel-resume-btn")).toBeDisabled();
    expect(screen.getByTestId("panel-abort-btn")).toBeDisabled();

    // Rerender with hasCheckpoint
    rerender(<LoopControlPanel {...defaultProps} executionState="inactive" hasCheckpoint={true} />);
    expect(screen.getByTestId("panel-resume-btn")).not.toBeDisabled();

    // Rerender in executing state
    rerender(<LoopControlPanel {...defaultProps} executionState="executing" />);
    expect(screen.getByTestId("panel-pause-btn")).not.toBeDisabled();
    expect(screen.getByTestId("panel-abort-btn")).not.toBeDisabled();
    expect(screen.getByTestId("panel-force-consensus-btn")).not.toBeDisabled();
    expect(screen.getByTestId("panel-force-summarize-btn")).not.toBeDisabled();
  });

  it("calls callbacks when actions are clicked", async () => {
    const onPause = vi.fn<() => void>();
    const onForceConsensus = vi.fn<() => void>();
    render(
      <LoopControlPanel
        {...defaultProps}
        executionState="executing"
        onPause={onPause}
        onForceConsensus={onForceConsensus}
      />,
    );

    const pauseBtn = screen.getByTestId("panel-pause-btn");
    fireEvent.click(pauseBtn);
    await waitFor(() => {
      expect(onPause).toHaveBeenCalled();
    });

    const forceConsensusBtn = screen.getByTestId("panel-force-consensus-btn");
    fireEvent.click(forceConsensusBtn);
    await waitFor(() => {
      expect(onForceConsensus).toHaveBeenCalled();
    });
  });

  it("toggles expanded and collapsed state", () => {
    render(<LoopControlPanel {...defaultProps} />);
    expect(screen.getByTestId("stat-round")).toBeInTheDocument();

    const toggleBtn = screen.getByTestId("toggle-panel-expanded-btn");
    fireEvent.click(toggleBtn);

    expect(screen.queryByTestId("stat-round")).not.toBeInTheDocument();
  });
});
