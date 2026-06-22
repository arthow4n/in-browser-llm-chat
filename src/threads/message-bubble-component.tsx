import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { useNavigate } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import type { Message, AskQuestionsQuestion, ThreadStatus } from "../db/db-schema";
import { streamingMessageBubbleMachine } from "./streaming-message-bubble-machine";
import { AskQuestionsComponent } from "./ask-questions-component";
import { ProposalComponent } from "./proposal-component";
import {
  editMessageAndRollback,
  deleteMessageAndRollback,
  branchThread,
} from "../db/db-operations";
import { messageActionsMachine } from "./message-actions-machine";
import { MessageAccordionComponent } from "./message-accordion-component";
import "katex/dist/katex.min.css";

export interface MessageBubbleComponentProps {
  message: Message;
  isStreaming?: boolean;
  nestedTools?: Message[]; // Support rendering nested tool calls/results
  threadStatus?: ThreadStatus;
  threadTitle?: string;
  allMessages?: Message[];
  onRefreshThread?: () => void;
}

function isActionEnabled(
  message: Message,
  threadStatus: ThreadStatus | undefined,
  allMessages: Message[],
): { enabled: boolean; reason?: string } {
  const isExecutionActive = threadStatus && threadStatus !== "inactive" && threadStatus !== "error";
  if (isExecutionActive) {
    return { enabled: false, reason: "Cannot modify history while thread is executing" };
  }

  if (message.checkpointId !== null && message.checkpointNs !== null) {
    return { enabled: true };
  }

  if (message.sequence === 0) {
    return { enabled: true };
  }

  const sortedMsgs = [...allMessages].sort((a, b) => a.sequence - b.sequence);
  const targetIndex = sortedMsgs.findIndex((m) => m.id === message.id);
  if (targetIndex !== -1) {
    let hasCheckpointsBefore = false;
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (sortedMsgs[i].checkpointId !== null) {
        hasCheckpointsBefore = true;
        break;
      }
    }
    const threadHasAnyCheckpoints = sortedMsgs.some((m) => m.checkpointId !== null);
    if (!hasCheckpointsBefore && !threadHasAnyCheckpoints) {
      return { enabled: true };
    }
  }

  return { enabled: false, reason: "Historical checkpoints for this message have been compacted" };
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
  threadStatus,
  threadTitle,
  allMessages = [],
  onRefreshThread,
}: MessageBubbleComponentProps) {
  const { role, content, name, type } = message;

  const navigate = useNavigate();
  const [state, send] = useMachine(streamingMessageBubbleMachine);
  const [actionsState, sendActions] = useMachine(messageActionsMachine, {
    input: {
      messageId: message.id,
      originalContent: message.content,
      role: message.role,
    },
  });

  // Effect to synchronize original content if it changes externally
  useEffect(() => {
    // If the original content changes externally, make sure to reset originalContent if not editing
    if (content !== actionsState.context.originalContent && actionsState.matches("viewing")) {
      sendActions({ type: "UPDATE_CONTENT", content });
      sendActions({ type: "VALIDATION_RESULT", isValid: true });
    }
  }, [content, actionsState.context.originalContent, actionsState, sendActions]);

  // Handle DB saving operation when entering "saving" state
  useEffect(() => {
    let active = true;
    if (actionsState.matches("saving")) {
      editMessageAndRollback(message.threadId, message.id, actionsState.context.editContent)
        .then(() => {
          if (active) {
            sendActions({ type: "SAVE_SUCCESS" });
            if (onRefreshThread) {
              onRefreshThread();
            }
          }
        })
        .catch((err) => {
          if (active) {
            sendActions({ type: "SAVE_FAILURE", error: err });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [
    actionsState,
    message.threadId,
    message.id,
    actionsState.context.editContent,
    sendActions,
    onRefreshThread,
  ]);

  // Handle DB delete operation when entering "deleting" state
  useEffect(() => {
    let active = true;
    if (actionsState.matches("deleting")) {
      deleteMessageAndRollback(message.threadId, message.id)
        .then(() => {
          if (active) {
            sendActions({ type: "DELETE_SUCCESS" });
            if (onRefreshThread) {
              onRefreshThread();
            }
          }
        })
        .catch((err) => {
          if (active) {
            sendActions({ type: "DELETE_FAILURE", error: err });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [actionsState, message.threadId, message.id, sendActions, onRefreshThread]);

  // Handle DB branching operation when entering "branching" state
  useEffect(() => {
    let active = true;
    if (actionsState.matches("branching")) {
      branchThread(message.threadId, message.id, actionsState.context.branchNameInput)
        .then((newThreadId) => {
          if (active) {
            sendActions({ type: "BRANCH_SUCCESS", newThreadId });
            if (onRefreshThread) {
              onRefreshThread();
            }
            void navigate(`/threads/${newThreadId}`);
          }
        })
        .catch((err) => {
          if (active) {
            sendActions({ type: "BRANCH_FAILURE", error: err });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [
    actionsState,
    message.threadId,
    message.id,
    actionsState.context.branchNameInput,
    sendActions,
    onRefreshThread,
    navigate,
  ]);

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

  const isPromptingDiscard = actionsState.matches("promptingDiscard");
  const isSaving = actionsState.matches("saving");
  const isPromptingDelete = actionsState.matches("promptingDelete");
  const isDeleting = actionsState.matches("deleting");
  const isPromptingBranch = actionsState.matches("promptingBranch");
  const isBranching = actionsState.matches("branching");
  const isMenuOpen = actionsState.matches({ viewing: "menuOpen" });

  const showEditor =
    actionsState.matches("editing") ||
    actionsState.matches("saving") ||
    (actionsState.matches("error") &&
      actionsState.context.editContent !== actionsState.context.originalContent) ||
    isPromptingDiscard;

  const actionEnabling = isActionEnabled(message, threadStatus, allMessages);

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
        {/* Reasoning is handled inside the MessageAccordionComponent wrapper in message-text-content */}

        {/* Overflow Actions Menu Button */}
        {!isStreaming && (
          <div
            className={`message-actions-container ${isMenuOpen ? "menu-open" : ""}`}
            data-testid={`message-actions-${message.id}`}
          >
            <button
              className="message-actions-trigger"
              onClick={() => sendActions({ type: isMenuOpen ? "CLOSE_MENU" : "OPEN_MENU" })}
              data-testid={`message-actions-btn-${message.id}`}
              title="Message actions"
            >
              •••
            </button>

            {isMenuOpen && (
              <div
                className="message-actions-menu"
                data-testid={`message-actions-menu-${message.id}`}
              >
                <div className={!actionEnabling.enabled ? "action-tooltip-container" : ""}>
                  <button
                    className="message-actions-menu-item"
                    onClick={() => sendActions({ type: "EDIT" })}
                    disabled={!actionEnabling.enabled}
                    data-testid={`message-action-edit-${message.id}`}
                  >
                    ✏️ Edit
                  </button>
                  {!actionEnabling.enabled && (
                    <div className="action-tooltip">{actionEnabling.reason}</div>
                  )}
                </div>

                <div className={!actionEnabling.enabled ? "action-tooltip-container" : ""}>
                  <button
                    className="message-actions-menu-item text-danger"
                    onClick={() => sendActions({ type: "TRIGGER_DELETE" })}
                    disabled={!actionEnabling.enabled}
                    data-testid={`message-action-delete-${message.id}`}
                  >
                    🗑️ Delete
                  </button>
                  {!actionEnabling.enabled && (
                    <div className="action-tooltip">{actionEnabling.reason}</div>
                  )}
                </div>

                <div className={!actionEnabling.enabled ? "action-tooltip-container" : ""}>
                  <button
                    className="message-actions-menu-item"
                    onClick={() =>
                      sendActions({
                        type: "TRIGGER_BRANCH",
                        defaultBranchName: `Branch of ${threadTitle || "Untitled Chat"}`,
                      })
                    }
                    disabled={!actionEnabling.enabled}
                    data-testid={`message-action-branch-${message.id}`}
                  >
                    🌿 Branch
                  </button>
                  {!actionEnabling.enabled && (
                    <div className="action-tooltip">{actionEnabling.reason}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="message-text-content" data-testid={`message-content-${message.id}`}>
          {showEditor ? (
            <div className="message-editor-container" data-testid={`message-editor-${message.id}`}>
              <textarea
                className="message-editor-textarea"
                value={actionsState.context.editContent}
                onChange={(e) => sendActions({ type: "UPDATE_CONTENT", content: e.target.value })}
                disabled={isSaving}
                data-testid={`message-editor-textarea-${message.id}`}
                placeholder="Type your message..."
              />
              {actionsState.context.errorMessage && (
                <div
                  className="error-text"
                  style={{ fontSize: "0.85rem", color: "var(--error-text)" }}
                >
                  {actionsState.context.errorMessage}
                </div>
              )}
              <div className="message-editor-controls">
                <button
                  className="btn btn-secondary"
                  onClick={() => sendActions({ type: "CANCEL_EDIT" })}
                  disabled={isSaving}
                  data-testid={`message-editor-cancel-${message.id}`}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => sendActions({ type: "SAVE" })}
                  disabled={!actionsState.context.isValidContent || isSaving}
                  data-testid={`message-editor-save-${message.id}`}
                >
                  {isSaving ? <span className="inline-spinner"></span> : "Save"}
                </button>
              </div>
            </div>
          ) : type === "reasoning" ? (
            <MessageAccordionComponent
              title="Thinking Process"
              icon="💭"
              testId={`reasoning-accordion-${message.id}`}
            >
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
            </MessageAccordionComponent>
          ) : (
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
          )}
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
                  <MessageAccordionComponent
                    title={toolDisplayName}
                    icon="🛠️"
                    testId={`tool-accordion-${toolMsg.id}`}
                  >
                    <div className="nested-tool-content">
                      <pre>
                        <code>{displayContent}</code>
                      </pre>
                    </div>
                  </MessageAccordionComponent>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Discard changes dialog */}
      {isPromptingDiscard && (
        <div className="message-action-modal-overlay" data-testid={`modal-discard-${message.id}`}>
          <div className="message-action-modal">
            <h3>Discard Changes</h3>
            <p>You have unsaved changes. Are you sure you want to discard them?</p>
            <div className="message-action-modal-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => sendActions({ type: "ABORT_DISCARD" })}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => sendActions({ type: "CONFIRM_DISCARD" })}
                data-testid={`modal-discard-confirm-${message.id}`}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {(isPromptingDelete || isDeleting) && (
        <div className="message-action-modal-overlay" data-testid={`modal-delete-${message.id}`}>
          <div className="message-action-modal">
            <h3>Delete Message</h3>
            <p>
              Are you sure you want to delete this message? Deleting this message will roll back
              execution checkpoints and delete all subsequent messages in this thread.
            </p>
            {actionsState.context.errorMessage && (
              <div className="error-text" style={{ color: "var(--error-text)" }}>
                {actionsState.context.errorMessage}
              </div>
            )}
            <div className="message-action-modal-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => sendActions({ type: "CANCEL_DELETE" })}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => sendActions({ type: "CONFIRM_DELETE" })}
                disabled={isDeleting}
                data-testid={`modal-delete-confirm-${message.id}`}
              >
                {isDeleting ? <span className="inline-spinner"></span> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch thread dialog */}
      {(isPromptingBranch || isBranching) && (
        <div className="message-action-modal-overlay" data-testid={`modal-branch-${message.id}`}>
          <div className="message-action-modal">
            <h3>Branch Thread</h3>
            <p>
              Create a new thread starting from this message. Enter a name for the branched thread:
            </p>
            <input
              type="text"
              className="message-action-modal-input"
              value={actionsState.context.branchNameInput}
              onChange={(e) => sendActions({ type: "UPDATE_BRANCH_NAME", name: e.target.value })}
              disabled={isBranching}
              placeholder="New thread name"
              data-testid={`modal-branch-input-${message.id}`}
            />
            {actionsState.context.errorMessage && (
              <div className="error-text" style={{ color: "var(--error-text)" }}>
                {actionsState.context.errorMessage}
              </div>
            )}
            <div className="message-action-modal-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => sendActions({ type: "CANCEL_BRANCH" })}
                disabled={isBranching}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => sendActions({ type: "CONFIRM_BRANCH" })}
                disabled={!actionsState.context.branchNameInput.trim() || isBranching}
                data-testid={`modal-branch-confirm-${message.id}`}
              >
                {isBranching ? <span className="inline-spinner"></span> : "Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
