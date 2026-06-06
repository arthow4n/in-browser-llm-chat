# Business Logic Review Findings - 2026-06-06

This document contains the findings of the general business logic review performed on 2026-06-06. The review focused on ensuring the implementation aligns with the specifications in `docs/scratchpad.md`.

## 1. Scratchpad Alignment

### ✅ Aligned Features

- **Budget Policy Enforcement**: The budget tracking for `stepsInCurrentRun` and `tokensInCurrentRun` is correctly implemented in `src/workflow/graphRunnerActor.ts`. It performs checks before LLM calls and before each LangGraph step, correctly interrupting execution and notifying the parent coordinator.
- **System Message Injection**: The compilation pipeline in `src/workflow/graphRunnerActor.ts` (`compileMessagesForLLM`) accurately implements the pruning, deduplication, and merging rules described in the scratchpad. It correctly handles the specific role requirements of the Gemini API.
- **Multi-Agent Rendering**: `src/ui/ChatMessage.tsx` correctly implements agent names, avatars, and distinct styling for assistant messages in multi-agent workflows, as specified.
- **UI State Machine Policy**: The application's core navigation and execution are driven by the `parentCoordinatorMachine`, and specialized UI components use dedicated state machines (e.g., `proposedActionCardMachine.ts`), adhering to the XState policy.

### ❌ Missing/Misaligned Features

- **Manual History Edit and Branching (Critical Gap)**:
  - The entire feature set for manual history editing, message deletion, and thread branching is **completely unimplemented**.
  - The specified "Inline Message Editor & Action State Machine" (described in section H of the scratchpad) is missing.
  - The rollback logic (identifying target checkpoints, purging descendant checkpoints/writes, and truncating messages) is not implemented anywhere in the codebase.
  - The UI options (Edit/Delete/Branch) in the message bubble overflow menu are missing from `src/ui/ChatMessage.tsx`.

## 2. Undocumented Logic

No significant undocumented business logic was found. The implementation strictly follows the provided specifications where features are implemented.

## 3. Consistency & Coherence

- The implementation of the budget policy defaults (5 steps) is consistent with the scratchpad.
- The data flow between the `parentCoordinatorMachine` and the `graphRunnerActor` (using XState's actor model) is coherent and matches the architecture proposal.

## 4. Logical Soundness

- The budget enforcement logic is robust, checking limits both at the start of a node and during the streaming of steps.
- The system message injection logic correctly handles the "Gemini-style" role conversion for non-initial system messages, preventing API errors.

## Planned Fixes

### High Priority

- [ ] **Implement Manual History Edit and Branching**:
  - Create the `messageEditorMachine.ts` to handle editing, deleting, and branching states.
  - Implement the rollback logic in the database layer (e.g., `src/db/db.ts` or a new service) to purge descendant checkpoints and truncate messages.
  - Add the Edit/Delete/Branch options to the `ChatMessage` overflow menu.
  - Implement the branching logic to clone messages and checkpoints into a new thread.

### Medium Priority

- [ ] **Verify and implement "Edit Last Message" shortcut**: The `ErrorBubble` component has a placeholder for "Edit and Resubmit" logic that is currently a TODO. This should be linked to the newly implemented message editor.
