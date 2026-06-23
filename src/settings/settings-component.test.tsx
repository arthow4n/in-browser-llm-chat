import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { SettingsComponent } from "./settings-component";

describe("SettingsComponent UI Tests", () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders loader initially then loads settings form controls", async () => {
    render(<SettingsComponent />);

    // Loader / skeleton should be present
    expect(screen.getByTestId("settings-skeleton")).toBeInTheDocument();

    // Eventually form controls are displayed
    await waitFor(
      () => {
        expect(screen.getByLabelText("Gemini API Key")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByLabelText("OpenRouter API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("Theme Override")).toBeInTheDocument();
    expect(screen.getByText("Injected System Messages")).toBeInTheDocument();
  });

  it("updates theme selection and shows dirty state actions", async () => {
    render(<SettingsComponent />);

    await waitFor(
      () => {
        expect(screen.getByLabelText("Theme Override")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const themeSelect = screen.getByTestId("theme-select") as HTMLSelectElement;
    expect(themeSelect.value).toBe("system");

    // Save button should be disabled initially (clean state)
    const saveBtn = screen.getByTestId("save-settings-btn");
    expect(saveBtn).toBeDisabled();

    // Reset button should be disabled initially
    const resetBtn = screen.getByTestId("reset-settings-btn");
    expect(resetBtn).toBeDisabled();

    // Select dark mode
    fireEvent.change(themeSelect, { target: { value: "dark" } });
    expect(themeSelect.value).toBe("dark");

    // Save and reset button should now be enabled
    expect(saveBtn).not.toBeDisabled();
    expect(resetBtn).not.toBeDisabled();

    // Click Reset
    fireEvent.click(resetBtn);
    expect(themeSelect.value).toBe("system");
    expect(saveBtn).toBeDisabled();
  });

  it("adds, edits, and removes injected system messages", async () => {
    render(<SettingsComponent />);

    await waitFor(
      () => {
        expect(screen.getByText("Injected System Messages")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const addBtn = screen.getByTestId("add-system-message-btn");
    fireEvent.click(addBtn);

    // Message row should appear
    const textareas = await screen.findAllByPlaceholderText("System instructions...");
    expect(textareas).toHaveLength(1);

    const depthInput = screen.getByTestId("system-message-depth-0") as HTMLInputElement;
    expect(depthInput.value).toBe("0");

    // Edit content and depth
    fireEvent.change(textareas[0], { target: { value: "You are an assistant." } });
    fireEvent.change(depthInput, { target: { value: "2" } });

    expect((textareas[0] as HTMLTextAreaElement).value).toBe("You are an assistant.");
    expect(depthInput.value).toBe("2");

    // Save settings
    const saveBtn = screen.getByTestId("save-settings-btn");
    fireEvent.click(saveBtn);

    // Wait for success banner
    await screen.findByTestId("success-banner");
    expect(screen.getByText("Settings saved successfully!")).toBeInTheDocument();

    // Remove row
    const deleteBtn = screen.getByTestId("remove-system-message-0");
    fireEvent.click(deleteBtn);

    expect(screen.queryByPlaceholderText("System instructions...")).not.toBeInTheDocument();
  });

  it("triggers API connection testing", async () => {
    render(<SettingsComponent />);

    await waitFor(
      () => {
        expect(screen.getByLabelText("Gemini API Key")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const geminiInput = screen.getByTestId("gemini-api-key-input");
    fireEvent.change(geminiInput, { target: { value: "mock-gemini-key" } });

    const testBtn = screen.getByTestId("test-gemini-connection-btn");
    expect(testBtn).not.toBeDisabled();

    fireEvent.click(testBtn);

    // Success banner should show
    await screen.findByTestId("success-banner");
    expect(screen.getByText("Connection test successful!")).toBeInTheDocument();
  });

  it("hides advanced configurations in onboarding mode", async () => {
    render(<SettingsComponent mode="onboarding" />);

    // Wait for form controls to display
    await waitFor(
      () => {
        expect(screen.getByLabelText("Gemini API Key")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Verify advanced controls are NOT present
    expect(screen.queryByLabelText("Theme Override")).not.toBeInTheDocument();
    expect(screen.queryByText("Storage & Data Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Injected System Messages")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reset-settings-btn")).not.toBeInTheDocument();
    expect(screen.queryByText("Global Settings")).not.toBeInTheDocument();
  });
});
