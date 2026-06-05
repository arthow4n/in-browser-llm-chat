import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "./App";

vi.mock("@xstate/react", () => ({
  useMachine: () => [{ value: "idle", context: {} }, vi.fn<(...args: unknown[]) => void>()],
}));

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

    // Check for main content area
    const mainHeading = screen.getByRole("heading", { level: 1, name: /Welcome to LLM Chat/i });
    expect(mainHeading).toBeDefined();
  });
});
