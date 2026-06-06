import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "./App";
import { CoordinatorProvider } from "./context/CoordinatorContext";
import { resetDBPromise } from "./db/db.js";

describe("App", () => {
  beforeEach(() => {
    resetDBPromise();
  });

  it("renders the Carbon layout shell", () => {
    render(
      <MemoryRouter>
        <CoordinatorProvider>
          <App />
        </CoordinatorProvider>
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
