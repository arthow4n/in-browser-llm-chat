import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { setSetting, savePreset } from "../db/db-operations";
import type { IDBPDatabase } from "idb";
import type { InBrowserLlmChatDB } from "../db/db-connection";
import { AppComponent } from "../app/app-component";

describe("Layout and Routing Integration Tests", () => {
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

  it("should render main layout with header, sidebar, and navigate between pages", async () => {
    // Populate DB with keys to bypass onboarding
    await setSetting("api_keys", { openRouter: "mock-key", gemini: "" });

    render(<AppComponent />);

    // Wait for the workspace layout to render
    await waitFor(() => {
      expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    });

    // Check sidebar and header components exist
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-header")).toBeInTheDocument();

    // Default route renders New Chat page, verify header reflects this
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("In-Browser LLM Chat");
    });

    // Click on presets link
    const presetsLink = screen.getByTestId("presets-nav-link");
    fireEvent.click(presetsLink);

    // Header title should update to Presets
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("LLM Presets");
    });

    // Click back to settings link
    const settingsLink = screen.getByTestId("settings-nav-link");
    fireEvent.click(settingsLink);

    // Header title should update back to Settings
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("Global Settings");
    });
  });

  it("should open and close mobile sidebar drawer", async () => {
    await setSetting("api_keys", { openRouter: "mock-key", gemini: "" });

    render(<AppComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    });

    const sidebar = screen.getByTestId("app-sidebar");
    expect(sidebar).not.toHaveClass("mobile-open");

    // Click mobile menu button
    const menuBtn = screen.getByTestId("header-mobile-menu-btn");
    fireEvent.click(menuBtn);

    // Sidebar should have mobile-open class
    expect(sidebar).toHaveClass("mobile-open");

    // Click mobile close button
    const closeBtn = screen.getByTestId("sidebar-close-btn");
    fireEvent.click(closeBtn);

    // Sidebar should lose mobile-open class
    expect(sidebar).not.toHaveClass("mobile-open");
  });

  it("should support thread creation, selection, and deletion", async () => {
    // Mock confirm dialog to return true
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);

    await setSetting("api_keys", { openRouter: "mock-key", gemini: "" });
    await savePreset({
      id: "mock-preset",
      name: "Mock Preset",
      provider: "openrouter",
      model: "google/gemini-flash",
      apiKey: "mock-key",
      temperature: 0.7,
      budgetPolicy: { maxStepsWithoutUser: 10, maxTokensPerRun: null },
    });

    render(<AppComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    });

    // 1. Thread Creation
    const newChatBtn = screen.getByTestId("new-chat-btn");
    fireEvent.click(newChatBtn);

    // Wait for the new chat setup screen
    await waitFor(() => {
      expect(screen.getByTestId("new-chat-view")).toBeInTheDocument();
    });

    // Fill in the prompt text
    const textarea = screen.getByPlaceholderText("How can I help you today?");
    fireEvent.change(textarea, { target: { value: "New Chat" } });

    // Submit the form
    const submitBtn = screen.getByText("Launch Chat Thread 🚀");
    fireEvent.click(submitBtn);

    // Sidebar should display the newly created thread link
    // The link should render with text "New Chat" or similar, and we should transition routes (so header title updates)
    let threadLink: HTMLElement | null = null;
    await waitFor(() => {
      threadLink = screen.getByText("New Chat", { selector: ".thread-title-text" });
      expect(threadLink).toBeInTheDocument();
    });

    // Header title should update to "New Chat" because we automatically transitioned
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("New Chat");
    });

    // 2. Thread Selection
    // Switch to settings first
    const settingsLink = screen.getByTestId("settings-nav-link");
    fireEvent.click(settingsLink);

    // Wait for the URL path change to reflect in the state/UI title
    await waitFor(
      () => {
        expect(screen.getByTestId("header-title")).toHaveTextContent("Global Settings");
      },
      { timeout: 2000 },
    );

    // Click the thread link to select it
    // Refresh the threadLink query to be safe
    const activeThreadLink = screen.getByText("New Chat", { selector: ".thread-title-text" });
    fireEvent.click(activeThreadLink);
    await waitFor(
      () => {
        expect(screen.getByTestId("header-title")).toHaveTextContent("New Chat");
      },
      { timeout: 2000 },
    );

    // 3. Thread Deletion
    // Find the delete button next to the thread title in the list
    const deleteBtn = screen.getByText("🗑");
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();

    // The thread link should be gone, and we should be redirected back to global settings (since we deleted the active thread)
    await waitFor(
      () => {
        expect(
          screen.queryByText("New Chat", { selector: ".thread-title-text" }),
        ).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    await waitFor(
      () => {
        expect(screen.getByTestId("header-title")).toHaveTextContent("Global Settings");
      },
      { timeout: 2000 },
    );

    confirmSpy.mockRestore();
  });

  it("should render the version information with repository and commit links when commit hash is available", async () => {
    vi.stubEnv("VITE_COMMIT_HASH", "abcdef1234567890");
    await setSetting("api_keys", { openRouter: "mock-key", gemini: "" });
    render(<AppComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-version-info")).toBeInTheDocument();
    });

    const repoLink = screen.getByTestId("version-repo-link");
    expect(repoLink).toBeInTheDocument();
    expect(repoLink).toHaveAttribute("href", "https://github.com/arthow4n/in-browser-llm-chat/");
    expect(repoLink).toHaveTextContent("in-browser-llm-chat");

    const commitLink = screen.getByTestId("version-commit-link");
    expect(commitLink).toHaveAttribute(
      "href",
      "https://github.com/arthow4n/in-browser-llm-chat/commit/abcdef1234567890",
    );
    expect(commitLink).toHaveTextContent("abcdef1");
  });

  it("should render the version information with unknown span when commit hash is not available", async () => {
    vi.stubEnv("VITE_COMMIT_HASH", "unknown");
    await setSetting("api_keys", { openRouter: "mock-key", gemini: "" });
    render(<AppComponent />);

    await waitFor(() => {
      expect(screen.getByTestId("sidebar-version-info")).toBeInTheDocument();
    });

    const repoLink = screen.getByTestId("version-repo-link");
    expect(repoLink).toBeInTheDocument();
    expect(repoLink).toHaveAttribute("href", "https://github.com/arthow4n/in-browser-llm-chat/");
    expect(repoLink).toHaveTextContent("in-browser-llm-chat");

    const unknownSpan = screen.getByTestId("version-commit-unknown");
    expect(unknownSpan).toHaveTextContent("unknown");
  });
});
