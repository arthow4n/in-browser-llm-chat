import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import "fake-indexeddb/auto";
import * as db from "./db/db.js";

// Mock the db module so components that call DB helpers get sensible defaults
vi.mock("./db/db.js", async () => {
  const actual = await vi.importActual("./db/db.js");
  return {
    ...actual,
    getPaginatedThreads: vi.fn<typeof db.getPaginatedThreads>().mockResolvedValue({
      threads: [],
      hasMore: false,
    }),
    getAllWorkflows: vi.fn<typeof db.getAllWorkflows>().mockResolvedValue([]),
    getAllPresets: vi.fn<typeof db.getAllPresets>().mockResolvedValue([]),
    getSetting: vi.fn<typeof db.getSetting>().mockResolvedValue(undefined),
    sweepInitializingThreads: vi
      .fn<typeof db.sweepInitializingThreads>()
      .mockResolvedValue(undefined),
    sweepDeletingThreads: vi.fn<typeof db.sweepDeletingThreads>().mockResolvedValue(undefined),
  };
});

describe("App", () => {
  it("renders the Carbon layout shell", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    // Check for Header elements
    const header = screen.getByRole("banner", { name: /LLM Chat/i });
    expect(header).toBeDefined();

    // Check for HeaderName
    const headerName = screen.getAllByText(/Chat/i);
    expect(headerName.length).toBeGreaterThan(0);
  });
});
