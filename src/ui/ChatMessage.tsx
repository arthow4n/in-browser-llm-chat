import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MessageStore } from "../db/db";
import { Accordion, AccordionItem } from "@carbon/react";

interface ChatMessageProps {
  message: MessageStore;
}

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
    backgroundColor: isUser ? "var(--cds-layer-open-01)" : "var(--cds-layer-01)",
    color: "var(--cds-text-primary)",
    border: "1px solid var(--cds-border-subtle)",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: isUser ? "flex-end" : "flex-start",
    marginBottom: "1rem",
    width: "100%",
  };

  const agentNameStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: "bold",
    marginBottom: "0.25rem",
    color: "var(--cds-text-secondary)",
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
      {isAssistant && message.name && <div style={agentNameStyle}>{message.name}</div>}
      <div style={bubbleStyle}>
        {message.type === "text" && (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
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
