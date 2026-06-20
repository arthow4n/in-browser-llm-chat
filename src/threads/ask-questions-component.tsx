import { useEffect, useState } from "react";
import { useMachine } from "@xstate/react";
import { askQuestionsMachine } from "./ask-questions-machine";
import type { AskQuestionsQuestion } from "../db/db-schema";

export interface AskQuestionsComponentProps {
  threadId: string;
  toolCallId: string;
  questions: AskQuestionsQuestion[];
  draftAnswers?: Record<string, Record<string, { selected?: string[]; text?: string }>>;
  onSubmitSuccess?: () => void;
  isSubmitted?: boolean;
  isRefused?: boolean;
  submittedAnswers?: Record<
    string,
    { selected?: string[]; text?: string; refused?: boolean; refusalReason?: string }
  >;
  refusalReason?: string;
}

export function AskQuestionsComponent({
  threadId,
  toolCallId,
  questions,
  draftAnswers,
  onSubmitSuccess,
  isSubmitted = false,
  isRefused = false,
  submittedAnswers,
  refusalReason,
}: AskQuestionsComponentProps) {
  const [state, send] = useMachine(askQuestionsMachine);
  const [showRefusalInput, setShowRefusalInput] = useState(false);
  const [refusalText, setRefusalText] = useState("");

  useEffect(() => {
    if (!isSubmitted && !isRefused) {
      send({
        type: "LOAD_QUESTIONS",
        threadId,
        toolCallId,
        questions,
        draftAnswers,
      });
    }
  }, [threadId, toolCallId, questions, draftAnswers, isSubmitted, isRefused, send]);

  useEffect(() => {
    if (state.matches("submitted") || state.matches("refused")) {
      onSubmitSuccess?.();
    }
  }, [state, onSubmitSuccess]);

  if (isSubmitted || isRefused || state.matches("submitted") || state.matches("refused")) {
    const badgeText = isSubmitted || state.matches("submitted") ? "Submitted" : "Refused";
    const badgeClass = isSubmitted || state.matches("submitted") ? "submitted" : "refused";
    const answersData =
      submittedAnswers || (state.matches("submitted") ? state.context.answers : {});
    const refReason = refusalReason || state.context.refusalReason;

    return (
      <div
        className={`ask-questions-card read-only ${badgeClass}`}
        data-testid="ask-questions-card"
      >
        <header className="card-header">
          <span className="card-icon">❓</span>
          <h4>Interactive Questionnaire</h4>
          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
        </header>
        {isRefused || state.matches("refused") ? (
          <div className="refusal-details" data-testid="refusal-details">
            <p>
              <strong>Reason for refusal:</strong> {refReason || "No reason provided."}
            </p>
          </div>
        ) : (
          <div className="answers-summary">
            {questions.map((q) => {
              const ans = answersData[q.id];
              return (
                <div key={q.id} className="question-summary-item">
                  <p className="question-text">
                    <strong>{q.text}</strong>
                  </p>
                  {ans?.selected && ans.selected.length > 0 && (
                    <ul className="selected-options">
                      {ans.selected.map((opt) => (
                        <li key={opt}>{opt}</li>
                      ))}
                    </ul>
                  )}
                  {ans?.text && <p className="comment-text">Comment: "{ans.text}"</p>}
                  {!ans?.selected?.length && !ans?.text && (
                    <p className="no-answer">No answer provided.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const { answers, isValid, validationErrors, errorMessage } = state.context;
  const isSubmitting = state.matches("submitting") || state.matches("refusing");

  const handleOptionChange = (questionId: string, option: string, isSingle: boolean) => {
    const current = answers[questionId]?.selected || [];
    let next: string[];
    if (isSingle) {
      next = [option];
    } else {
      next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    }
    send({
      type: "UPDATE_ANSWER",
      questionId,
      answer: { selected: next },
    });
  };

  const handleTextChange = (questionId: string, text: string) => {
    send({
      type: "UPDATE_ANSWER",
      questionId,
      answer: { text },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !isSubmitting) {
      send({ type: "SUBMIT" });
    }
  };

  const handleRefuseSubmit = () => {
    if (!isSubmitting) {
      send({ type: "REFUSE", refusalReason: refusalText });
    }
  };

  return (
    <form className="ask-questions-card" onSubmit={handleSubmit} data-testid="ask-questions-card">
      <header className="card-header">
        <span className="card-icon">❓</span>
        <h4>Interactive Questionnaire</h4>
        <span className="status-badge active">Pending Input</span>
      </header>

      {errorMessage && (
        <div className="card-error-banner" data-testid="card-error">
          {errorMessage}
        </div>
      )}

      <div className="questions-list">
        {questions.map((q) => {
          const ans = answers[q.id] || {};
          const err = validationErrors[q.id];
          return (
            <div key={q.id} className="question-field" data-testid={`question-field-${q.id}`}>
              <label className="question-label">
                {q.text} {q.required && <span className="required-indicator">*</span>}
              </label>

              {q.type !== "free-text" && q.options && (
                <div className="options-group">
                  {q.options.map((opt) => {
                    const isChecked = ans.selected?.includes(opt) || false;
                    const id = `q-${q.id}-opt-${opt}`;
                    return (
                      <label key={opt} htmlFor={id} className="option-item">
                        <input
                          id={id}
                          type={q.type === "single-select" ? "radio" : "checkbox"}
                          name={`q-${q.id}`}
                          checked={isChecked}
                          disabled={isSubmitting}
                          onChange={() => handleOptionChange(q.id, opt, q.type === "single-select")}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {(q.type === "free-text" || q.allowFreetext) && (
                <div className="comment-group">
                  <textarea
                    className="freetext-input"
                    placeholder={
                      q.type === "free-text" ? "Enter your answer here..." : "Add a comment..."
                    }
                    value={ans.text || ""}
                    disabled={isSubmitting}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    style={{ fontSize: "16px", minHeight: "80px" }}
                  />
                </div>
              )}

              {err && <span className="field-error-message">{err}</span>}
            </div>
          );
        })}
      </div>

      {showRefusalInput ? (
        <div className="refusal-reason-wrapper" data-testid="refusal-reason-input">
          <textarea
            className="freetext-input"
            placeholder="Please enter reasoning for refusal..."
            value={refusalText}
            disabled={isSubmitting}
            onChange={(e) => setRefusalText(e.target.value)}
            style={{ fontSize: "16px", minHeight: "80px" }}
          />
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSubmitting}
              onClick={() => setShowRefusalInput(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isSubmitting}
              onClick={handleRefuseSubmit}
              data-testid="confirm-refusal-btn"
            >
              Confirm Refusal
            </button>
          </div>
        </div>
      ) : (
        <div className="card-actions">
          <button
            type="button"
            className="btn btn-secondary refuse-btn"
            disabled={isSubmitting}
            onClick={() => setShowRefusalInput(true)}
            data-testid="refuse-btn"
          >
            Refuse to Answer
          </button>
          <button
            type="submit"
            className="btn btn-primary submit-btn"
            disabled={!isValid || isSubmitting}
            data-testid="submit-btn"
          >
            {isSubmitting ? <span className="spinner small-spinner"></span> : "Submit Answers"}
          </button>
        </div>
      )}
    </form>
  );
}
