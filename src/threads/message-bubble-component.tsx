import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import type { Message } from "../db/db-schema";
import "katex/dist/katex.min.css";

export interface MessageBubbleComponentProps {
  message: Message;
}

export function MessageBubbleComponent({ message }: MessageBubbleComponentProps) {
  const { role, content, name, type } = message;

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

  return (
    <div className={`message-row-wrapper ${role}-row`} data-testid={`message-row-${message.id}`}>
      <div className="message-header-bar">
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
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
