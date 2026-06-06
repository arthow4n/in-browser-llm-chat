import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MessageStore, saveMessage } from "../db/db";
import { Accordion, AccordionItem } from "@carbon/react";
import { CodeBlock } from "./CodeBlock";
import { AskQuestionsForm } from "./AskQuestionsForm";
import { ProposedActionCard } from "./ProposedActionCard";
import { AskQuestionsResponse, type Answer } from "../schemas/tools";

interface ChatMessageProps {
  message: MessageStore;
  allMessages: MessageStore[];
  send: (event: unknown) => void;
  currentThreadId: string;
  draftAnswers: Record<string, unknown>;
}

const getAvatarColor = (name: string) => {
  const colors = [
    "var(--cds-layer-open-03)",
    "var(--cds-layer-open-04)",
    "var(--cds-layer-open-05)",
    "var(--cds-layer-open-06)",
    "var(--cds-layer-open-07)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  allMessages,
  send,
  currentThreadId,
  draftAnswers,
}) => {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  const bubbleStyle: React.CSSProperties = {
    maxWidth: "80%",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    marginBottom: "1rem",
    wordBreak: "break-word",
    alignSelf: isUser ? "flex-end" : "flex-start",
    backgroundColor: isUser
      ? "var(--cds-layer-open-01)"
      : message.type === "tool_call" || message.type === "tool_result"
        ? "var(--cds-layer-00)"
        : "var(--cds-layer-01)",
    color: "var(--cds-text-primary)",
    border: "1px solid var(--cds-border-subtle)",
    borderLeft:
      message.type === "tool_call" || message.type === "tool_result"
        ? "4px solid var(--cds-layer-open-03)"
        : "1px solid var(--cds-border-subtle)",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: isUser ? "flex-end" : "flex-start",
    marginBottom: "1rem",
    width: "100%",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.75rem",
    fontWeight: "bold",
    marginBottom: "0.25rem",
    color: "var(--cds-text-secondary)",
  };

  const avatarStyle: React.CSSProperties = {
    width: "1.25rem",
    height: "1.25rem",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.6rem",
    color: "var(--cds-text-primary)",
    fontWeight: "bold",
    backgroundColor: getAvatarColor(message.name || "Assistant"),
  };

  if (isSystem) {
    return (
      <div
        style={{
          textAlign: "center",
          margin: "1rem 0",
          fontSize: "0.75rem",
          color: "var(--cds-text-disabled)",
        }}
      >
        {message.content}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {isAssistant && (
        <div style={headerStyle}>
          <div style={avatarStyle}>{(message.name || "Assistant")[0].toUpperCase()}</div>
          <div>{message.name || "Assistant"}</div>
        </div>
      )}
      <div style={bubbleStyle}>
        {message.type === "text" && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return match ? (
                  <CodeBlock
                    language={match[1]}
                    code={
                      Array.isArray(children)
                        ? children.join("").replace(/\n$/, "")
                        : typeof children === "string"
                          ? children.replace(/\n$/, "")
                          : ""
                    }
                  />
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
        {message.type === "reasoning" && (
          <Accordion>
            <AccordionItem title="Reasoning">
              <div
                style={{
                  fontSize: "0.875rem",
                  fontStyle: "italic",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {message.content}
              </div>
            </AccordionItem>
          </Accordion>
        )}
        {message.type === "tool_call" && (
          <Accordion>
            <AccordionItem title={`Tool Call: ${message.name || "Unknown Tool"}`}>
              {message.name === "ask_questions" ? (
                allMessages.some(
                  (m) => m.type === "tool_result" && m.toolCallId === message.toolCallId,
                ) ? (
                  <div style={{ color: "var(--cds-text-disabled)", fontSize: "0.875rem" }}>
                    Answered. See the tool result below.
                  </div>
                ) : (
                  <AskQuestionsForm
                    threadId={currentThreadId}
                    toolCallId={message.toolCallId || ""}
                    questions={JSON.parse(message.content || "[]")}
                    initialDrafts={draftAnswers as Record<string, Record<string, Answer>>}
                    onUpdateDraft={() => {}} // handled internally by component & DB
                    onSubmit={async (response: AskQuestionsResponse) => {
                      const resultMessage: MessageStore = {
                        id: crypto.randomUUID(),
                        threadId: currentThreadId,
                        sequence: allMessages.length,
                        role: "tool",
                        content: JSON.stringify(response),
                        type: "tool_result",
                        toolCallId: message.toolCallId,
                        name: "ask_questions",
                        createdAt: Date.now(),
                        checkpointId: null,
                        checkpointNs: null,
                      };
                      await saveMessage(resultMessage);
                      send({ type: "SUBMIT_TOOL_RESPONSE", response });
                    }}
                  />
                )
              ) : message.name === "create_workflow" || message.name === "update_workflow" ? (
                allMessages.some(
                  (m) => m.type === "tool_result" && m.toolCallId === message.toolCallId,
                ) ? (
                  <div style={{ color: "var(--cds-text-disabled)", fontSize: "0.875rem" }}>
                    Approved/Denied. See the tool result below.
                  </div>
                ) : (
                  <ProposedActionCard
                    toolCallId={message.toolCallId || ""}
                    actionType={message.name === "create_workflow" ? "create" : "update"}
                    payload={JSON.parse(message.content || "{}")}
                    originalPayload={
                      message.name === "update_workflow"
                        ? allMessages.find(
                            (m) => m.name === "get_workflow" && m.type === "tool_result",
                          )?.content
                          ? JSON.parse(
                              allMessages.find(
                                (m) => m.name === "get_workflow" && m.type === "tool_result",
                              )!.content,
                            )
                          : undefined
                        : undefined
                    }
                    onApprove={async (toolCallId) => {
                      const resultMessage: MessageStore = {
                        id: crypto.randomUUID(),
                        threadId: currentThreadId,
                        sequence: allMessages.length,
                        role: "tool",
                        content: JSON.stringify({ status: "approved" }),
                        type: "tool_result",
                        toolCallId: toolCallId,
                        name: message.name || "unknown",
                        createdAt: Date.now(),
                        checkpointId: null,
                        checkpointNs: null,
                      };
                      await saveMessage(resultMessage);
                      send({ type: "SUBMIT_TOOL_RESPONSE", response: { status: "approved" } });
                    }}
                    onDeny={async (toolCallId) => {
                      const resultMessage: MessageStore = {
                        id: crypto.randomUUID(),
                        threadId: currentThreadId,
                        sequence: allMessages.length,
                        role: "tool",
                        content: JSON.stringify({ status: "denied" }),
                        type: "tool_result",
                        toolCallId: toolCallId,
                        name: message.name || "unknown",
                        createdAt: Date.now(),
                        checkpointId: null,
                        checkpointNs: null,
                      };
                      await saveMessage(resultMessage);
                      send({ type: "SUBMIT_TOOL_RESPONSE", response: { status: "denied" } });
                    }}
                  />
                )
              ) : (
                <pre style={{ fontSize: "0.75rem", overflowX: "auto" }}>{message.content}</pre>
              )}
            </AccordionItem>
          </Accordion>
        )}
        {message.type === "tool_result" && (
          <Accordion>
            <AccordionItem title={`Tool Result: ${message.name || "Unknown Tool"}`}>
              {message.name === "ask_questions" ? (
                <div style={{ fontSize: "0.875rem" }}>
                  {Object.entries(JSON.parse(message.content || "{}").answers || {}).map(
                    ([qId, ans]: [string, unknown]) => {
                      const a = ans as {
                        refused?: boolean;
                        refusalReason?: string;
                        selected?: string[];
                        text?: string;
                      };
                      return (
                        <div key={qId} style={{ marginBottom: "0.5rem" }}>
                          <strong>Question {qId}:</strong>
                          {a.refused ? (
                            <div style={{ color: "red" }}>
                              Refused: {a.refusalReason || "No reason provided"}
                            </div>
                          ) : (
                            <div style={{ marginLeft: "0.5rem" }}>
                              {a.selected?.length ? `Selected: ${a.selected.join(", ")}` : ""}
                              {a.text ? `Text: ${a.text}` : ""}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              ) : (
                <pre style={{ fontSize: "0.75rem", overflowX: "auto" }}>{message.content}</pre>
              )}
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
};
