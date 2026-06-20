import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatInputComponent } from "./chat-input-component";

describe("ChatInputComponent", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render component in enabled/disabled states", () => {
    const handleSubmit = vi.fn<(text: string, role: "user" | "assistant" | "system") => void>();
    const { rerender } = render(<ChatInputComponent isDisabled={true} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea");
    const roleSelector = screen.getByTestId("chat-role-selector");
    const sendBtn = screen.getByTestId("chat-send-btn");

    expect(textarea).toBeDisabled();
    expect(roleSelector).toBeDisabled();
    expect(sendBtn).toBeDisabled();
    expect(textarea).toHaveAttribute("placeholder", "Please wait...");

    // Enable component
    rerender(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);
    expect(textarea).toBeEnabled();
    expect(roleSelector).toBeEnabled();
    expect(sendBtn).toBeDisabled(); // disabled because text is empty
    expect(textarea).toHaveAttribute(
      "placeholder",
      "Type a message... (Press Enter to send, Shift+Enter for newline)",
    );
  });

  it("should enable send button when text is entered, and select custom roles", () => {
    const handleSubmit = vi.fn<(text: string, role: "user" | "assistant" | "system") => void>();
    render(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea") as HTMLTextAreaElement;
    const roleSelector = screen.getByTestId("chat-role-selector") as HTMLSelectElement;
    const sendBtn = screen.getByTestId("chat-send-btn");

    fireEvent.change(textarea, { target: { value: "Hello assistant" } });
    expect(sendBtn).toBeEnabled();

    fireEvent.change(roleSelector, { target: { value: "assistant" } });
    expect(roleSelector.value).toBe("assistant");
  });

  it("should submit using the Send button", async () => {
    const handleSubmit = vi
      .fn<(text: string, role: "user" | "assistant" | "system") => Promise<void>>()
      .mockImplementation(() => Promise.resolve());
    render(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea");
    const sendBtn = screen.getByTestId("chat-send-btn");

    fireEvent.change(textarea, { target: { value: "A test prompt" } });
    fireEvent.click(sendBtn);

    expect(handleSubmit).toHaveBeenCalledWith("A test prompt", "user");
    await waitFor(() => {
      // Upon successful submit, state becomes disabled, input is cleared
      expect(textarea).toHaveValue("");
    });
  });

  it("should submit using Enter key on desktop", async () => {
    const handleSubmit = vi
      .fn<(text: string, role: "user" | "assistant" | "system") => Promise<void>>()
      .mockImplementation(() => Promise.resolve());
    render(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea");
    fireEvent.change(textarea, { target: { value: "Desktop enter prompt" } });

    // Press Enter without Shift
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(handleSubmit).toHaveBeenCalledWith("Desktop enter prompt", "user");
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("should not submit using Enter key on desktop if Shift is pressed", () => {
    const handleSubmit = vi.fn<(text: string, role: "user" | "assistant" | "system") => void>();
    render(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea");
    fireEvent.change(textarea, { target: { value: "Draft message" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("should not submit using Enter key on mobile layout", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 480,
    });

    const handleSubmit = vi.fn<(text: string, role: "user" | "assistant" | "system") => void>();
    render(<ChatInputComponent isDisabled={false} onSubmit={handleSubmit} />);

    const textarea = screen.getByTestId("chat-input-textarea");
    fireEvent.change(textarea, { target: { value: "Mobile message" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
