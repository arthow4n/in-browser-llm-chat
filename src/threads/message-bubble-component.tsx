import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import type { Message, AskQuestionsQuestion } from "../db/db-schema";
import { streamingMessageBubbleMachine } from "./streaming-message-bubble-machine";
import { AskQuestionsComponent } from "./ask-questions-component";
import { ProposalComponent } from "./proposal-component";
import "katex/dist/katex.min.css";

export interface MessageBubbleComponentProps {
  message: Message;
  isStreaming?: boolean;
  nestedTools?: Message[]; // Support rendering nested tool calls/results
}

// Helper to generate a deterministic background color based on name
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "#4f46e5", // Indigo
    "#0ea5e9", // Sky
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Violet
    "#ec4899", // Pink
    "#14b8a6", // Teal
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function MessageBubbleComponent({
  message,
  isStreaming = false,
  nestedTools = [],
}: MessageBubbleComponentProps) {
  const { role, content, name, type } = message;

  const [state, send] = useMachine(streamingMessageBubbleMachine);

  // Synchronize incoming streaming content with the state machine
  useEffect(() => {
    if (isStreaming) {
      send({ type: "STREAM_START" });
    }
  }, [isStreaming, send]);

  useEffect(() => {
    if (isStreaming) {
      // Find the new token chunk to send
      const currentRaw = state.context.rawText;
      if (content.startsWith(currentRaw) && content.length > currentRaw.length) {
        const delta = content.slice(currentRaw.length);
        send({ type: "TOKEN_RECEIVED", token: delta });
      }
    }
  }, [content, isStreaming, state.context.rawText, send]);

  useEffect(() => {
    if (!isStreaming && state.value === "streaming") {
      send({ type: "STREAM_END" });
    }
  }, [isStreaming, state.value, send]);

  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";
  const isTool = role === "tool";

  let displayName = "";
  if (name) {
    displayName = name;
  } else if (isUser) {
    displayName = "User";
  } else if (isAssistant) {
    displayName = "Assistant";
  } else if (isSystem) {
    displayName = "System";
  } else if (isTool) {
    displayName = `Tool (${message.toolCallId || "Unknown"})`;
  }

  // Define class names based on role and type
  const bubbleClass = `message-bubble ${role} ${type === "reasoning" ? "reasoning-bubble" : ""}`;

  // Decide what text to display (debounced or raw content depending on streaming status)
  const textToDisplay = isStreaming ? state.context.debouncedText : content;

  // Generate avatar initials and color
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : "?";
  const avatarBg = isUser
    ? "var(--accent-color)"
    : isSystem
      ? "#64748b"
      : getAvatarColor(displayName);

  return (
    <div className={`message-row-wrapper ${role}-row`} data-testid={`message-row-${message.id}`}>
      <div className="message-header-bar" data-testid={`message-header-${message.id}`}>
        <div
          className="message-avatar"
          style={{ backgroundColor: avatarBg }}
          data-testid={`message-avatar-${message.id}`}
        >
          {initials}
        </div>
        <span className="message-sender-name" data-testid={`message-sender-${message.id}`}>
          {displayName}
        </span>
        <span className="message-timestamp">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className={bubbleClass} data-testid={`message-bubble-${message.id}`}>
        {type === "reasoning" && (
          <div className="reasoning-indicator">
            <span className="reasoning-icon">💭</span>
            <span className="reasoning-label">Thinking Process</span>
          </div>
        )}

        <div className="message-text-content" data-testid={`message-content-${message.id}`}>
          <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
            components={{
              // Ensure clean link presentation and styling
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              // Use modern syntax highlighting or basic pre formatting for code block components
              code: ({ className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || "");
                const isInline = !match;
                return isInline ? (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                ) : (
                  <pre className="code-block-pre">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
            }}
          >
            {textToDisplay}
          </ReactMarkdown>
        </div>

        {/* Nested Tool Calls/Results rendering inside the bubble */}
        {nestedTools.length > 0 && (
          <div className="nested-tools-container" data-testid={`nested-tools-${message.id}`}>
            {nestedTools.map((toolMsg) => {
              // Only render from the perspective of the tool call (or mock standalone tool result if tool call is missing)
              const isToolResult = toolMsg.role === "tool";
              if (isToolResult) {
                // If there's a corresponding tool call in the nestedTools list, skip rendering this result directly
                // because it will be rendered inside the tool call's rendering.
                const hasCall = nestedTools.some(
                  (m) => m.role === "assistant" && m.toolCallId === toolMsg.toolCallId,
                );
                if (hasCall) {
                  return null;
                }
              }

              if (toolMsg.name === "ask_questions") {
                let questions: AskQuestionsQuestion[] = [];
                try {
                  const parsed = JSON.parse(toolMsg.content);
                  questions = parsed.questions || [];
                } catch {
                  // ignore
                }

                // Look for corresponding tool result to determine submitted/refused status
                const resultMsg = nestedTools.find(
                  (m) =>
                    m.role === "tool" &&
                    m.toolCallId === toolMsg.toolCallId &&
                    m.name === "ask_questions",
                );

                let isSubmitted = false;
                let isRefused = false;
                let submittedAnswers:
                  | Record<
                      string,
                      {
                        selected?: string[];
                        text?: string;
                        refused?: boolean;
                        refusalReason?: string;
                      }
                    >
                  | undefined = undefined;
                let refusalReason = "";

                if (resultMsg) {
                  try {
                    const resultObj = JSON.parse(resultMsg.content);
                    submittedAnswers = resultObj.answers || {};
                    const ansList = Object.values(submittedAnswers || {});
                    isRefused = ansList.some((ans) => ans?.refused);
                    isSubmitted = !isRefused;
                    if (isRefused) {
                      refusalReason =
                        ansList.find((ans) => ans?.refusalReason)?.refusalReason || "";
                    }
                  } catch {
                    // ignore
                  }
                }

                return (
                  <div
                    key={toolMsg.id}
                    className="nested-tool-questions"
                    data-testid={`nested-tool-questions-${toolMsg.id}`}
                  >
                    <AskQuestionsComponent
                      threadId={message.threadId}
                      toolCallId={toolMsg.toolCallId || ""}
                      questions={questions}
                      isSubmitted={isSubmitted}
                      isRefused={isRefused}
                      submittedAnswers={submittedAnswers}
                      refusalReason={refusalReason}
                    />
                  </div>
                );
              }

              // Generic Proposal Action Cards for tools modifying databases
              if (
                toolMsg.name === "declare_consensus" ||
                toolMsg.name?.startsWith("custom_workflow_")
              ) {
                let proposalData = {};
                try {
                  proposalData = JSON.parse(toolMsg.content);
                } catch {
                  // ignore
                }

                const resultMsg = nestedTools.find(
                  (m) => m.role === "tool" && m.toolCallId === toolMsg.toolCallId,
                );

                let isApproved = false;
                let isRejected = false;
                let rejectionReason = "";

                if (resultMsg) {
                  try {
                    const resultObj = JSON.parse(resultMsg.content);
                    isApproved = resultObj.approved === true;
                    isRejected = resultObj.approved === false;
                    rejectionReason = resultObj.reason || "";
                  } catch {
                    // ignore
                  }
                }

                return (
                  <div
                    key={toolMsg.id}
                    className="nested-tool-proposal"
                    data-testid={`nested-tool-proposal-${toolMsg.id}`}
                  >
                    <ProposalComponent
                      threadId={message.threadId}
                      toolCallId={toolMsg.toolCallId || ""}
                      toolName={toolMsg.name}
                      proposalData={proposalData}
                      isApproved={isApproved}
                      isRejected={isRejected}
                      rejectionReason={rejectionReason}
                    />
                  </div>
                );
              }

              const resultMsg = nestedTools.find(
                (m) => m.role === "tool" && m.toolCallId === toolMsg.toolCallId,
              );
              const toolDisplayName = toolMsg.name || `Tool (${toolMsg.toolCallId || "Unknown"})`;
              const displayContent = resultMsg ? resultMsg.content : toolMsg.content;

              return (
                <div
                  key={toolMsg.id}
                  className={`nested-tool-bubble ${resultMsg ? "tool" : "assistant"}`}
                  data-testid={`nested-tool-${toolMsg.id}`}
                >
                  <div className="nested-tool-header">
                    <span className="nested-tool-icon">🛠️</span>
                    <span className="nested-tool-name">{toolDisplayName}</span>
                  </div>
                  <div className="nested-tool-content">
                    <pre>
                      <code>{displayContent}</code>
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
