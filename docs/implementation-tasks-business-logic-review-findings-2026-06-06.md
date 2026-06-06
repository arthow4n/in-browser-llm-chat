# Implementation Tasks: Business Logic Review Findings - 2026-06-06

## Source

This document is based on the findings in `docs/business-logic-review-findings-2026-06-06.md`.

The primary goal is to implement the missing **Manual History Edit and Branching** functionality, including the data layer rollback logic, the UI state machine for editing, and the integration into the chat interface.

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Tasks must be executed in the order listed. Do not skip steps.
2. **Verification**: After every step, the agent MUST verify the state of the worktree and the correctness of the implementation:
   - Run `npm run format`
   - Run `npm run typecheck`
   - Run `npm run lint:fix`
   - Run `npm run test`
   - Run `npm run build`
3. **Code Review**: Perform a self-review or use a subagent for code review before committing.
4. **Commit Conventions**: All commits must follow the guidelines in `AGENTS.md`.
5. **UI Policy**: Use ONLY Carbon Design System components. No custom CSS for aesthetics.
6. **State Machine Policy**: All interactive states must be driven by XState state machines. No local `useState` for UI state transitions.

---

## 1. Data Layer & Rollback Logic

### Step 1.1: Implement Message Truncation Logic

Implement the ability to remove all messages in a thread that occur after a specific message ID.

- [x] Implement `truncateMessages(threadId: string, messageId: string)` in `src/db/db.ts` (or a dedicated database service).
- [x] Verify that messages after the specified ID are correctly deleted from the database.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit changes.

### Step 1.2: Implement Checkpoint Purging Logic

Implement the logic to identify and purge LangGraph checkpoints and associated writes that are descendants of a target point.

- [ ] Investigate the current LangGraph checkpointer implementation to determine how checkpoints are indexed and stored.
- [ ] Implement logic to find all checkpoint IDs created after a given timestamp or sequence number associated with a message.
- [ ] Implement the deletion of these checkpoints and their corresponding writes in the database.
- [ ] Verify that the graph state is correctly rolled back to the target checkpoint.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

### Step 1.3: Implement Thread Branching (Cloning)

Implement the logic to clone a thread up to a specific message, creating a new independent thread.

- [ ] Implement `branchThread(originalThreadId: string, messageId: string)`:
  - Create a new thread entry in the database.
  - Copy all messages from the original thread up to and including `messageId` into the new thread.
  - Identify the checkpoint state at the point of `messageId` and clone it to the new thread, ensuring a new unique thread ID is associated with the cloned state.
- [ ] Verify that the new thread is independent and starting from the correct point.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 2. Message Editor State Machine

### Step 2.1: Create `messageEditorMachine.ts`

Implement the XState machine to manage the lifecycle of editing, deleting, and branching a message.

- [ ] Create `src/ui/machines/messageEditorMachine.ts`.
- [ ] Define the following states:
  - `idle`: No message is being edited.
  - `editing`: A message is currently being edited in the inline editor.
  - `deleting`: User is confirming deletion of a message.
  - `branching`: User is confirming the creation of a new branch from a message.
- [ ] Define the following events:
  - `EDIT_START`: Transition to `editing` state with `messageId` and `text`.
  - `EDIT_SAVE`: Trigger save logic and transition back to `idle`.
  - `EDIT_CANCEL`: Transition back to `idle`.
  - `DELETE_CONFIRM`: Trigger deletion logic and transition back to `idle`.
  - `DELETE_CANCEL`: Transition back to `idle`.
  - `BRANCH_START`: Transition to `branching` state.
  - `BRANCH_SAVE`: Trigger branching logic and transition back to `idle`.
  - `BRANCH_CANCEL`: Transition back to `idle`.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

### Step 2.2: Integrate `messageEditorMachine` into Application State

Integrate the `messageEditorMachine` as a child actor of the `parentCoordinatorMachine` to ensure global accessibility and consistent state management.

- [ ] Add the `messageEditorMachine` as a spawned actor in the `parentCoordinatorMachine` configuration.
- [ ] Implement the integration so that `ChatMessage` and `MessageEditor` components can send events to and read state from the machine via the parent coordinator.
- [ ] Verify that the machine is correctly initialized and accessible.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 3. UI Integration - Message Bubble

### Step 3.1: Update `ChatMessage` Overflow Menu

Add the trigger options for editing, deleting, and branching to the user's message bubbles.

- [ ] Update `src/ui/ChatMessage.tsx` to add "Edit", "Delete", and "Branch" options to the overflow menu.
- [ ] Ensure these options are only visible for messages sent by the user.
- [ ] Connect these options to send events to the `messageEditorMachine`.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 4. UI Implementation - Inline Message Editor

### Step 4.1: Create `MessageEditor` Component

Implement the visual component for editing message text inline.

- [ ] Create `src/ui/MessageEditor.tsx` using Carbon Design System components (e.g., `TextArea`).
- [ ] Bind the component to the `messageEditorMachine` to handle input and actions (Save/Cancel).
- [ ] Implement the logic to trigger the `EDIT_SAVE` event with the updated text.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

### Step 4.2: Integrate `MessageEditor` into Chat Interface

Ensure the editor appears in the correct position when a message is being edited.

- [ ] Integrate `MessageEditor` into the chat list/message rendering logic so it replaces or appears alongside the `ChatMessage` when `messageEditorMachine` is in the `editing` state.
- [ ] Verify the visual transition and layout.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 5. Re-execution Trigger

### Step 5.1: Implement Graph Re-invocation Logic

Implement the mechanism to automatically trigger a new LLM run after a message has been edited or deleted.

- [ ] Implement a way to notify the `parentCoordinatorMachine` (or the relevant actor) that the history has been modified and a re-run is required.
- [ ] Ensure that the re-run starts from the point of modification, using the updated state and messages.
- [ ] Verify that the system correctly transition to the "Executing" state and initiates the graph runner.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 6. Error Bubble Integration

### Step 6.1: Implement "Edit and Resubmit" Logic in `ErrorBubble`

Link the existing TODO in the `ErrorBubble` to the new message editor functionality.

- [ ] Update the `ErrorBubble` component to trigger the `messageEditorMachine`'s `EDIT_START` event for the last user message in the thread when "Edit and Resubmit" is clicked.
- [ ] Verify that clicking the button correctly opens the editor for the preceding user message.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit changes.

## 7. Integration & End-to-End Verification

### Step 7.1: Verify Manual History Editing Flow

- [ ] Edit a user message, save it, and verify that:
  - The message is updated in the DB.
  - Subsequent messages are truncated.
  - The graph state is rolled back.
  - The LLM is re-invoked from the edit point.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Commit changes.

### Step 7.2: Verify Message Deletion Flow

- [ ] Delete a user message and verify that:
  - The message and all subsequent messages are removed.
  - The graph state is rolled back.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Commit changes.

### Step 7.3: Verify Thread Branching Flow

- [ ] Branch a thread from a specific message and verify that:
  - A new thread is created.
  - The new thread contains messages up to the branch point.
  - The new thread has the correct inherited state.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Commit changes.

## 8. Cleanup

- [ ] Archive the findings file by moving it to the `docs.outdated` directory.
  - [ ] Move `docs/business-logic-review-findings-2026-06-06.md` to `docs.outdated/`.
  - [ ] Commit the change.
