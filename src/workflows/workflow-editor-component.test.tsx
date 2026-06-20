import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { WorkflowEditorComponent } from "./workflow-editor-component";
import { saveWorkflow } from "../db/db-operations";
import type { Workflow } from "../db/db-schema";

describe("WorkflowEditorComponent UI Tests", () => {
  let db: IDBPDatabase<InBrowserLlmChatDB> | null = null;

  beforeAll(async () => {
    resetDBConnection();
    db = await getDB();
  });

  afterAll(async () => {
    if (db) {
      db.close();
    }
    resetDBConnection();
  });

  beforeEach(async () => {
    const storeNames = Array.from(db!.objectStoreNames);
    for (const name of storeNames) {
      await db!.clear(name);
    }
  });

  afterEach(() => {
    cleanup();
  });

  const testWorkflow: Workflow = {
    id: "custom-wf-test",
    name: "Custom UI Workflow",
    description: "UI test workflow",
    isBuiltIn: false,
    nodes: [{ id: "n1", type: "agent", name: "Agent 1" }],
    edges: [],
  };

  it("renders workflows list and built-in items", async () => {
    render(<WorkflowEditorComponent />);

    // Initially loading
    expect(screen.getByTestId("workflows-skeleton")).toBeInTheDocument();

    // After load, check built-in workflows are listed
    await waitFor(() => {
      expect(screen.getByText("Standard 1-Agent")).toBeInTheDocument();
      expect(screen.getByText("Debate")).toBeInTheDocument();
    });
  });

  it("enters viewing mode for built-in workflow", async () => {
    render(<WorkflowEditorComponent />);

    await waitFor(() => {
      expect(screen.getByText("Standard 1-Agent")).toBeInTheDocument();
    });

    const editBtn = screen.getByTestId("edit-workflow-standard-1-agent");
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("View Built-in Workflow")).toBeInTheDocument();
      const textarea = screen.getByTestId("workflow-json-editor") as HTMLTextAreaElement;
      expect(textarea.readOnly).toBe(true);
    });
  });

  it("enters editing mode and can save custom workflow changes", async () => {
    await saveWorkflow(testWorkflow);

    render(<WorkflowEditorComponent />);

    await waitFor(() => {
      expect(screen.getByText("Custom UI Workflow")).toBeInTheDocument();
    });

    const editBtn = screen.getByTestId("edit-workflow-custom-wf-test");
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("Edit Custom Workflow")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("workflow-json-editor") as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(false);

    // Modify the text
    const updatedWf = { ...testWorkflow, name: "UI Workflow Changed" };
    fireEvent.change(textarea, { target: { value: JSON.stringify(updatedWf, null, 2) } });

    // Wait for button to be enabled
    await waitFor(() => {
      const saveBtn = screen.getByTestId("editor-save-btn");
      expect(saveBtn).not.toBeDisabled();
    });

    const saveBtn = screen.getByTestId("editor-save-btn");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      // It should exit back to the list
      expect(screen.getByText("Agent Workflows")).toBeInTheDocument();
      expect(screen.getByText("UI Workflow Changed")).toBeInTheDocument();
    });
  });
});
