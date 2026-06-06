import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MessageStore } from "../db/db";
import { Accordion, AccordionItem } from "@carbon/react";
import { CodeBlock } from "./CodeBlock";

interface ChatMessageProps {
  message: MessageStore;
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

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
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
                        : (children as unknown as string).replace(/\n$/, "")
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
              <pre style={{ fontSize: "0.75rem", overflowX: "auto" }}>{message.content}</pre>
            </AccordionItem>
          </Accordion>
        )}
        {message.type === "tool_result" && (
          <Accordion>
            <AccordionItem title={`Tool Result: ${message.name || "Unknown Tool"}`}>
              <pre style={{ fontSize: "0.75rem", overflowX: "auto" }}>{message.content}</pre>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
};
