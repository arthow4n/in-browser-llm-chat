import React, { useState, useEffect } from "react";
import { TextInput, Checkbox, Button, Stack, Layer } from "@carbon/react";
import { saveThread, getThread } from "../db/db";
import { AskQuestionsResponse } from "../schemas/tools";

interface Question {
  id: string;
  text: string;
  type: "single-select" | "multi-select" | "free-text";
  options?: string[];
  allowFreetext: boolean;
  required: boolean;
}

interface Answer {
  selected?: string[];
  text?: string;
  refused?: boolean;
  refusalReason?: string;
}

interface AskQuestionsFormProps {
  threadId: string;
  toolCallId: string;
  questions: Question[];
  initialDrafts: Record<string, Record<string, Answer>> | null;
  onSubmit: (response: AskQuestionsResponse) => void;
  onUpdateDraft: (drafts: Record<string, Record<string, Answer>>) => void;
}

export const AskQuestionsForm: React.FC<AskQuestionsFormProps> = ({
  threadId,
  toolCallId,
  questions,
  initialDrafts,
  onSubmit,
  onUpdateDraft,
}) => {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    return (initialDrafts?.[toolCallId] as Record<string, Answer>) || {};
  });

  useEffect(() => {
    if (initialDrafts?.[toolCallId]) {
      setAnswers(initialDrafts[toolCallId] as Record<string, Answer>);
    }
  }, [initialDrafts, toolCallId]);

  const updateAnswer = (questionId: string, value: Partial<Answer>) => {
    const newAnswers = { ...answers, [questionId]: { ...answers[questionId], ...value } };
    setAnswers(newAnswers);
    onUpdateDraft({ [toolCallId]: newAnswers });

    // Also persist to DB for reliability
    void (async () => {
      const thread = await getThread(threadId);
      if (thread) {
        const draftAnswers = { ...thread.draftAnswers, [toolCallId]: newAnswers };
        await saveThread({ ...thread, draftAnswers });
      }
    })();
  };

  const isQuestionValid = (q: Question) => {
    const ans = answers[q.id];
    if (!ans) return !q.required;
    if (ans.refused) return true;
    if (q.type === "free-text") {
      return !q.required || (ans.text && ans.text.trim() !== "");
    }
    if (q.type === "single-select" || q.type === "multi-select") {
      return !q.required || (ans.selected && ans.selected.length > 0);
    }
    return true;
  };

  const allValid = questions.every(isQuestionValid);

  const handleSubmit = () => {
    const response: AskQuestionsResponse = {
      answers: {},
    };

    questions.forEach((q) => {
      const ans = answers[q.id] || {};
      response.answers[q.id] = {
        selected: ans.selected,
        text: ans.text,
        refused: ans.refused,
        refusalReason: ans.refusalReason,
      };
    });

    onSubmit(response);
  };

  return (
    <Layer
      style={{
        backgroundColor: "var(--cds-layer-01)",
        padding: "1rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--cds-border-subtle)",
      }}
    >
      <Stack gap={7}>
        <div style={{ fontWeight: "bold", fontSize: "1rem" }}>
          Please answer the following questions:
        </div>
        {questions.map((q) => (
          <div
            key={q.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontWeight: "medium" }}>
              {q.text} {q.required && <span style={{ color: "red" }}>*</span>}
            </div>

            {q.type === "free-text" && (
              <TextInput
                id={q.id}
                labelText="Answer"
                placeholder="Your answer..."
                value={answers[q.id]?.text || ""}
                onChange={(e) => updateAnswer(q.id, { text: e.target.value })}
              />
            )}

            {(q.type === "single-select" || q.type === "multi-select") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {q.options?.map((opt) => (
                  <Checkbox
                    key={opt}
                    id={`${q.id}-${opt}`}
                    labelText={opt}
                    checked={answers[q.id]?.selected?.includes(opt) || false}
                    onChange={() => {
                      const currentSelected = answers[q.id]?.selected || [];
                      let nextSelected;
                      if (q.type === "single-select") {
                        nextSelected = [opt];
                      } else {
                        nextSelected = currentSelected.includes(opt)
                          ? currentSelected.filter((o: string) => o !== opt)
                          : [...currentSelected, opt];
                      }
                      updateAnswer(q.id, {
                        selected: nextSelected,
                        refused: false,
                      });
                    }}
                  />
                ))}
              </div>
            )}

            {q.allowFreetext && q.type !== "free-text" && (
              <TextInput
                id={`${q.id}-comment`}
                labelText="Comment"
                placeholder="Additional comments..."
                value={answers[q.id]?.text || ""}
                onChange={(e) => updateAnswer(q.id, { text: e.target.value })}
              />
            )}

            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}
            >
              <Checkbox
                id={`${q.id}-refuse`}
                labelText="Refuse to Answer"
                checked={answers[q.id]?.refused || false}
                onChange={(e) =>
                  updateAnswer(q.id, {
                    refused: e.target.checked,
                    selected: [],
                    text: "",
                  })
                }
              />
              {answers[q.id]?.refused && (
                <TextInput
                  id={`${q.id}-refusal-reason`}
                  labelText="Reason"
                  placeholder="Reason for refusal..."
                  value={answers[q.id]?.refusalReason || ""}
                  onChange={(e) => updateAnswer(q.id, { refusalReason: e.target.value })}
                />
              )}
            </div>
          </div>
        ))}

        <Button disabled={!allValid} onClick={handleSubmit}>
          Submit Answers
        </Button>
      </Stack>
    </Layer>
  );
};
