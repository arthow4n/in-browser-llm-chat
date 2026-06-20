import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { setSetting } from "../db/db-operations";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { AppComponent } from "./app-component";

describe("AppComponent UI Tests", () => {
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

  it("renders loader then displays onboarding when database is empty", async () => {
    render(<AppComponent />);

    // Loader should be present initially
    expect(screen.getByTestId("app-loading")).toBeInTheDocument();

    // Onboarding card should load
    await waitFor(
      () => {
        expect(screen.getByTestId("onboarding-view")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByText("Welcome to In-Browser LLM Chat")).toBeInTheDocument();

    // Wait for settings inputs to load
    await waitFor(() => {
      expect(screen.getByLabelText("Gemini API Key")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("app-workspace")).not.toBeInTheDocument();
  });

  it("transitions to workspace view once API keys are saved", async () => {
    render(<AppComponent />);

    await waitFor(
      () => {
        expect(screen.getByTestId("onboarding-view")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Wait for settings inputs to load
    await waitFor(() => {
      expect(screen.queryByTestId("gemini-api-key-input")).toBeInTheDocument();
    });

    // Enter a key in the onboarding settings form
    const geminiInput = screen.getByTestId("gemini-api-key-input");
    fireEvent.change(geminiInput, { target: { value: "my-mocked-gemini-api-key" } });

    // Wait for the save button to be enabled (dirty state transition)
    const saveBtn = screen.getByTestId("save-settings-btn");
    await waitFor(() => {
      expect(saveBtn).not.toBeDisabled();
    });

    // Click Save
    fireEvent.click(saveBtn);

    // Onboarding should disappear and main workspace should appear
    await waitFor(
      () => {
        expect(screen.getByTestId("app-workspace")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.queryByTestId("onboarding-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("tab-settings-btn")).toBeInTheDocument();
    expect(screen.getByTestId("tab-presets-btn")).toBeInTheDocument();
  });

  it("skips onboarding and directly renders workspace if API keys exist", async () => {
    // Populate database with keys
    await setSetting("api_keys", { openRouter: "mocked-open-router-key", gemini: "" });

    render(<AppComponent />);

    // Loader should be present initially
    expect(screen.getByTestId("app-loading")).toBeInTheDocument();

    // Directly shows the workspace
    await waitFor(
      () => {
        expect(screen.getByTestId("app-workspace")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.queryByTestId("onboarding-view")).not.toBeInTheDocument();
  });
});
