import React from "react";
import { useMachine } from "@xstate/react";
import { createMachine } from "xstate";
import { Button } from "@carbon/react";
import { Copy, Download } from "@carbon/icons-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

const codeBlockMachine = createMachine({
  id: "codeBlock",
  initial: "idle",
  states: {
    idle: {
      on: {
        COPY: { target: "copying" },
        DOWNLOAD: { target: "downloading" },
      },
    },
    copying: {
      on: {
        SUCCESS: { target: "copied" },
        FAILURE: { target: "idle" },
      },
    },
    copied: {
      after: {
        2000: { target: "idle" },
      },
      on: {
        COPY: { target: "copying" },
        DOWNLOAD: { target: "downloading" },
      },
    },
    downloading: {
      on: {
        SUCCESS: { target: "idle" },
        FAILURE: { target: "idle" },
      },
    },
  },
});

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [state, send] = useMachine(codeBlockMachine);

  const handleCopy = async () => {
    send({ type: "COPY" });
    try {
      await navigator.clipboard.writeText(code);
      send({ type: "SUCCESS" });
    } catch (err) {
      console.error("Failed to copy:", err);
      send({ type: "FAILURE" });
    }
  };

  const handleDownload = async () => {
    send({ type: "DOWNLOAD" });
    try {
      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `code-${language || "txt"}.${language || "txt"}`;
      a.click();
      URL.revokeObjectURL(url);
      send({ type: "SUCCESS" });
    } catch (err) {
      console.error("Failed to download:", err);
      send({ type: "FAILURE" });
    }
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "var(--cds-layer-01)",
    padding: "0.25rem 0.5rem",
    borderTopLeftRadius: "0.25rem",
    borderTopRightRadius: "0.25rem",
    border: "1px solid var(--cds-border-subtle)",
    borderBottom: "none",
    fontSize: "0.75rem",
    color: "var(--cds-text-secondary)",
  };

  const buttonsStyle: React.CSSProperties = {
    display: "flex",
    gap: "0.5rem",
  };

  const preStyle: React.CSSProperties = {
    margin: 0,
    padding: "0.75rem",
    backgroundColor: "var(--cds-layer-01)",
    color: "var(--cds-text-primary)",
    border: "1px solid var(--cds-border-subtle)",
    borderTop: "none",
    borderRadius: "0 0 0.25rem 0.25rem",
    overflowX: "auto",
    fontSize: "0.875rem",
    fontFamily: "monospace",
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={headerStyle}>
        <span>{language ? language.toUpperCase() : "TEXT"}</span>
        <div style={buttonsStyle}>
          <Button
            kind="ghost"
            size="sm"
            onClick={handleCopy}
            renderIcon={() =>
              state.matches("copied") ? (
                <span style={{ fontSize: "0.75rem" }}>Copied!</span>
              ) : (
                <Copy size={16} />
              )
            }
          />
          <Button
            kind="ghost"
            size="sm"
            onClick={handleDownload}
            renderIcon={() => <Download size={16} />}
          />
        </div>
      </div>
      <pre style={preStyle}>
        <code>{code}</code>
      </pre>
    </div>
  );
};
