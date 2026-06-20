import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { getDB, resetDBConnection } from "../db/db-connection";
import { setSetting } from "../db/db-operations";
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

    // Default route redirects to Settings, verify header reflects this
    await waitFor(() => {
      expect(screen.getByTestId("header-title")).toHaveTextContent("Global Settings");
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
});
