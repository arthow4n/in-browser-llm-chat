import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AskQuestionsComponent } from "./ask-questions-component";
import type { AskQuestionsQuestion } from "../db/db-schema";
import { getDB, resetDBConnection } from "../db/db-connection";
import { saveThread } from "../db/db-operations";

describe("AskQuestionsComponent", () => {
  beforeEach(async () => {
    resetDBConnection();
    const db = await getDB();
    for (const name of Array.from(db.objectStoreNames)) {
      await db.clear(name);
    }
    // Set up a mock thread for database operations in state machine
    await saveThread({
      id: "8a2f463c-ef83-4c93-9f46-7b83887ff66e",
      title: "Test Thread",
      workflowId: "std",
      workflowSnapshot: {},
      activePresetId: "a2f463ce-f834-c939-f467-b83887ff66e2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentThreadId: null,
      parentMessageId: null,
      status: "awaiting_input",
      activeInterrupt: {
        type: "ask_questions",
        toolCallId: "call-1",
      },
      draftAnswers: {},
      errorMessage: null,
      latestCheckpointId: null,
      latestCheckpointNs: null,
      tokenStats: null,
    });
  });

  afterEach(async () => {
    cleanup();
    const db = await getDB();
    db.close();
    resetDBConnection();
  });

  const sampleQuestions: AskQuestionsQuestion[] = [
    {
      id: "q1",
      text: "Is this correct?",
      type: "single-select",
      options: ["Yes", "No"],
      allowFreetext: true,
      required: true,
    },
    {
      id: "q2",
      text: "Detailed explanation",
      type: "free-text",
      allowFreetext: true,
      required: false,
    },
  ];

  it("renders questionnaire questions and handles option changes & submission", async () => {
    const handleSuccess = vi.fn<() => void>();

    render(
      <AskQuestionsComponent
        threadId="8a2f463c-ef83-4c93-9f46-7b83887ff66e"
        toolCallId="call-1"
        questions={sampleQuestions}
        onSubmitSuccess={handleSuccess}
      />,
    );

    // Verify it renders the questionnaire card title
    expect(screen.getByText("Interactive Questionnaire")).toBeInTheDocument();
    expect(screen.getByText(/Is this correct\?/)).toBeInTheDocument();
    expect(screen.getByText(/Detailed explanation/)).toBeInTheDocument();

    // Verify options Yes/No are rendered
    expect(screen.getByLabelText("Yes")).toBeInTheDocument();
    expect(screen.getByLabelText("No")).toBeInTheDocument();

    // Submit button should be disabled initially (q1 is required)
    const submitBtn = screen.getByTestId("submit-btn");
    expect(submitBtn).toBeDisabled();

    // Select "Yes" option
    fireEvent.click(screen.getByLabelText("Yes"));

    // Now submit button should be enabled
    await waitFor(() => {
      expect(submitBtn).toBeEnabled();
    });

    // Write a comment in the allowFreetext comment box of q1
    const comments = screen.getAllByPlaceholderText("Add a comment...");
    fireEvent.change(comments[0], { target: { value: "My comment text" } });

    // Write free-text for q2
    const explanation = screen.getByPlaceholderText("Enter your answer here...");
    fireEvent.change(explanation, { target: { value: "Explaining here." } });

    // Submit answers
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it("handles refusal flow properly", async () => {
    const handleSuccess = vi.fn<() => void>();

    render(
      <AskQuestionsComponent
        threadId="8a2f463c-ef83-4c93-9f46-7b83887ff66e"
        toolCallId="call-1"
        questions={sampleQuestions}
        onSubmitSuccess={handleSuccess}
      />,
    );

    const refuseBtn = screen.getByTestId("refuse-btn");
    expect(refuseBtn).toBeEnabled();

    // Click refuse button to open refusal input
    fireEvent.click(refuseBtn);

    // Verify refusal input text area is shown
    const reasonInput = screen.getByPlaceholderText("Please enter reasoning for refusal...");
    expect(reasonInput).toBeInTheDocument();

    // Type refusal reason
    fireEvent.change(reasonInput, { target: { value: "Declining to share." } });

    // Confirm refusal
    const confirmBtn = screen.getByTestId("confirm-refusal-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalled();
    });
  });

  it("renders read-only/submitted state", () => {
    const submittedAnswers = {
      q1: { selected: ["Yes"], text: "Looking good!" },
      q2: { text: "No explanation." },
    };

    render(
      <AskQuestionsComponent
        threadId="8a2f463c-ef83-4c93-9f46-7b83887ff66e"
        toolCallId="call-1"
        questions={sampleQuestions}
        isSubmitted={true}
        submittedAnswers={submittedAnswers}
      />,
    );

    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText(/Looking good!/)).toBeInTheDocument();
    expect(screen.getByText(/No explanation\./)).toBeInTheDocument();
    expect(screen.queryByTestId("submit-btn")).not.toBeInTheDocument();
  });

  it("renders read-only/refused state", () => {
    render(
      <AskQuestionsComponent
        threadId="8a2f463c-ef83-4c93-9f46-7b83887ff66e"
        toolCallId="call-1"
        questions={sampleQuestions}
        isRefused={true}
        refusalReason="Not comfortable"
      />,
    );

    expect(screen.getByText("Refused")).toBeInTheDocument();
    expect(screen.getByText("Reason for refusal:")).toBeInTheDocument();
    expect(screen.getByText("Not comfortable")).toBeInTheDocument();
  });
});
