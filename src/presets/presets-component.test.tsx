import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { PresetsComponent } from "./presets-component";
import { savePreset } from "../db/db-operations";
import type { Preset } from "../db/db-schema";

describe("PresetsComponent UI Tests", () => {
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

  it("renders presets list layout when loaded", async () => {
    const testPreset: Preset = {
      id: "44444444-4444-4444-8444-444444444444",
      name: "List Test Preset",
      provider: "openrouter",
      model: "openrouter/model-name",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
    };
    await savePreset(testPreset);

    render(<PresetsComponent />);

    expect(screen.getByTestId("presets-skeleton")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByText("List Test Preset")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByText("openrouter")).toBeInTheDocument();
    expect(screen.getByText("openrouter/model-name")).toBeInTheDocument();
  });

  it("supports creation flow", async () => {
    render(<PresetsComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId("create-preset-btn")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Click create
    fireEvent.click(screen.getByTestId("create-preset-btn"));

    // Form fields should be visible
    expect(screen.getByLabelText(/Preset Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText(/Model Identification/)).toBeInTheDocument();

    // Input some values
    fireEvent.change(screen.getByTestId("preset-name-input"), {
      target: { value: "UI Created Preset" },
    });
    fireEvent.change(screen.getByTestId("preset-model-input"), { target: { value: "gemini-pro" } });

    // Submit
    fireEvent.click(screen.getByTestId("save-preset-btn"));

    // Wait for list view and success banner
    await waitFor(
      () => {
        expect(screen.getByTestId("presets-success-banner")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByText("Preset saved successfully!")).toBeInTheDocument();
    expect(screen.getByText("UI Created Preset")).toBeInTheDocument();
  });

  it("supports deletion flow with confirmation modal", async () => {
    const testPreset: Preset = {
      id: "55555555-5555-5555-8555-555555555555",
      name: "To Delete UI Preset",
      provider: "gemini",
      model: "gemini-2.5-flash",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
    };
    await savePreset(testPreset);

    render(<PresetsComponent />);

    await waitFor(
      () => {
        expect(screen.getByText("To Delete UI Preset")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Click delete
    fireEvent.click(screen.getByTestId(`delete-preset-${testPreset.id}`));

    // Confirm modal should open
    expect(screen.getByTestId("delete-confirm-modal")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete preset/)).toBeInTheDocument();

    // Cancel deletion
    fireEvent.click(screen.getByTestId("cancel-delete-btn"));
    expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();

    // Click delete again and confirm
    fireEvent.click(screen.getByTestId(`delete-preset-${testPreset.id}`));
    fireEvent.click(screen.getByTestId("confirm-delete-btn"));

    // Success banner should show and preset should be gone
    await waitFor(
      () => {
        expect(screen.getByTestId("presets-success-banner")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.queryByText("To Delete UI Preset")).not.toBeInTheDocument();
  });
});
