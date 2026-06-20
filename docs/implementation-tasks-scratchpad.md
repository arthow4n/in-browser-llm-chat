# Implementation Tasks: Scratchpad

**Source Plan:** "Break docs/scratchpad.md into very detailed and small-stepped task list which can be later consumed by execute-tasks skill, don't really execute the tasks. Just perform the detailed breakdown. Write the tasks to another markdown file."

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Execute the steps strictly in the order they are defined. Do not skip or jump ahead.
2. **Verify Worktree State**: Before finishing any step, ensure the workspace is clean and working by running:
   `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`
3. **Code Review & Quality Loop**: You must always dispatch a subagent to perform a code review. You must loop and iterate to fix any issues identified by the review, or by the tests/linter/typechecker, before marking the task as done. The worktree must always be left in a clean, working state after each step, meaning `git status` must be completely clean.
4. **Commit Conventions**: Commit the changes directly after finishing the step but don't push. The commit message must begin with the agent name prefix (e.g., `(Antigravity/Gemini 3.1 Pro (High)) Add X`).
5. **No Parallel Execution**: Do not try to implement multiple steps in a single execution loop. Focus on one specific task at a time.

## 1. Phase 1: Persistence & Global Configuration

- [x] **Step 1.1: Implement the IndexedDB schema and `idb` wrappers.** Set up the base connection using `idb`, define stores (`settings`, `presets`, `workflows`, `threads`, `messages`, `checkpoints`, `checkpoint_writes`), and implement basic read/write/delete utility functions for these stores.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [x] **Step 1.2: Build Global Settings CRUD.** Implement the form for global settings (API keys, themes, default presets, injected system messages) and back it with the `settings` store in IndexedDB.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [x] **Step 1.3: Build LLM Preset CRUD.** Implement preset creation, reading, updating, and deletion. Connect it with the `presets` DB store. Include the preset connection testing logic.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [x] **Step 1.4: Implement Theme Management & Onboarding.** Hook up the application theme switcher to the global setting. Add an onboarding view or blocker state that displays when no API keys are present in the `settings` store.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 2. Phase 2: Basic Chat Interface

- [x] **Step 2.1: Implement Main Application Layout.** Set up the parent React Router structure. Build the basic shell including the Sidebar (SideNav), Header, and main Chat Feed region using the Vanilla CSS custom design system.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [x] **Step 2.2: Build Thread Management CRUD.** Implement thread creation (New Chat), thread selection in the SideNav, and thread deletion logic (including asynchronous cascading deletes if applicable). Sync selected thread ID with the URL.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.
- [x] **Step 2.3: Implement Chat Input Area.** Build the chat input textbox with auto-resize. Hook it up to state machine logic to emit events when a user sends a message.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [x] **Step 2.4: Basic Message Bubble Rendering.** Implement the core message bubble component capable of displaying markdown and LaTeX. Handle distinctions between `user` and `assistant` role styling.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 3. Phase 3: Core Custom Orchestration Execution

- [x] **Step 3.1: Develop the Custom Checkpointer.** Implement the custom checkpointer class over IndexedDB (`checkpoints` and `checkpoint_writes` stores) to persist and load graph runner execution states.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Dispatch a subagent to perform code review.
  - [x] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [x] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 3.2: Implement `GraphRunnerActor`.** Build the child actor state machine responsible for running execution cycles, interacting with the checkpointer, and coordinating node tasks.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 3.3: Basic 1-Agent Workflow & Message Compilation.** Implement the compiler rules for taking raw message history and forming the exact payload for the LLM API. Hook up the Vercel AI SDK to perform the LLM call using the "Standard 1-agent" approach.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 3.4: Integrate Streaming.** Handle real-time text and reasoning token streaming from the LLM. Implement the `Streaming Message Bubble State Machine` with 100ms debouncing for markdown/LaTeX rendering.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 4. Phase 4: Workflow Management

- [ ] **Step 4.1: Build Custom Workflow CRUD.** Implement the necessary hooks and services for reading, writing, and deleting workflows in the `workflows` IndexedDB store. Include logic to prevent deletion of built-in workflows or workflows currently in use.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 4.2: Build the Workflow JSON Editor.** Implement the text-based JSON editor UI component (`Workflow JSON Editor State Machine`) for authoring workflow schemas.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 4.3: Add Structural Validation for Custom Workflows.** Add JSON schema and graph structure validation checks (e.g., connectivity, loops have exits, exact single entry node, agent-tool wiring) before allowing a workflow to be saved.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 4.4: Implement Workflow Compilation Factory.** Create the function that converts a validated JSON workflow schema into a runnable/executable custom orchestration graph in the runner. Add dynamic prompt placeholder resolution logic.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 5. Phase 5: Advanced Orchestration & Loops

- [ ] **Step 5.1: Implement Debate Workflow Logic.** Implement the built-in multi-agent Debate Workflow setup (Initiator, Debaters, Evaluators, Summarizer).
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 5.2: Conditional Routing and Consensus Evaluation.** Implement the compiler's conditional routing mechanism (`on_tool_call`, `on_tool_result`, `on_consensus`, `on_no_consensus`). Handle pure-rule vs. LLM-based `consensus_check` nodes.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 5.3: Build Execution & Loop Control Panel.** Create the UI component displaying the execution status, turn counter, and current round. Hook up the "Force Consensus" and "Force Summarize" interrupts.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 5.4: Implement Multi-Agent Message Rendering.** Refine the message bubble rendering to explicitly denote which agent is speaking (Avatar & Header Bar). Add tool call nesting inside the executing agent's bubble.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 6. Phase 6: Interactive Tools & Interrupts

- [ ] **Step 6.1: Implement `ask_questions` Tool.** Develop the LLM tool definition and the UI rendering for the interactive check-box/comment form in the chat feed (via `ask_questions` Tool Form State Machine). Handle user submission and runner resumption.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 6.2: Implement Proposal Action Cards.** Create generic approval cards for tools that modify the database (`declare_consensus`, custom workflow creation tools, etc.). Wait for user approval before resuming execution.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 6.3: Budget Policy Enforcement.** Implement background tracking of autonomous steps (`maxStepsWithoutUser`) and tokens (`maxTokensPerRun`). Fire a `budget_exceeded` interrupt when limits are hit.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 6.4: Budget Exceeded Card.** Implement the `Budget Exceeded Card` UI component. On user approval, reset the budget counters and resume graph execution.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 7. Phase 7: History Management & Refinement

- [ ] **Step 7.1: Implement Message Editor, Delete, and Branching UI.** Add contextual actions to individual messages allowing inline editing, deletion, and creating a new branched thread from that point.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 7.2: Rollback and Checkpoint Traversal.** Implement the logic to traverse lineage backwards to find the correct preceding checkpoint when history is truncated. Purge subsequent checkpoints and update the thread's `latestCheckpointId`.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 7.3: Thread Branching Logic.** When branching, deep clone the messages array, corresponding checkpoints, and checkpoint writes to a new thread record. Copy the parent's `workflowSnapshot` to ensure consistent execution.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 7.4: System Message Injection Pipeline.** Refine the compilation rule to dynamically pull global and workflow-specific system messages. Deduplicate and merge them at the specified target indices (`depth`).
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 8. Phase 8: UX Polish & Mobile Optimization

- [ ] **Step 8.1: Implement Mobile Adaptations.** Adapt the Sidebar to behave as an overlay drawer on mobile. Move the Loop Control into a mobile-friendly overlay. Ensure all touch targets meet the 44x44px requirement.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 8.2: Implement Chat Feed Auto-Scroll and Accordions.** Build the `Chat Feed Auto-Scroll State Machine` to gracefully handle user interrupts. Implement the `Message Accordion State Machine` for expanding/collapsing reasoning tokens and tool calls.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 8.3: Token Stats and Soft/Hard Syncing.** Build the "Sync to Latest Workflow" UI in Thread Settings to perform either a Soft Sync (prompts/presets only) or Hard Sync (destructive snapshot update). Ensure cumulative token statistics recalculate correctly after truncations/edits.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 8.4: Storage & Data Management UI (Backup/Restore).** Build the `Storage & Data Management State Machine` and modal for inspecting storage, performing JSON DB export, importing DB payloads, and wiping data via Factory Reset. Add batched asynchronous cascading deletions.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

## 9. Phase 9: Storage Maintenance

- [ ] **Step 9.1: Checkpoint Compaction.** Implement the "Compact Checkpoints" feature within Thread Settings. Hook up the `CheckpointCompactionDialog` UI to dispatch a delete operation for all thread checkpoints and writes EXCEPT the one matching `latestCheckpointId`.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.

- [ ] **Step 9.2: Apply Compaction Effects to UI.** Update all messages whose `checkpointId` was deleted to be `null`. Ensure the UI disables the "Edit", "Delete", and "Branch" options for those messages and displays an explanatory tooltip.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Dispatch a subagent to perform code review.
  - [ ] Loop and fix any issues found by the code review, tests, typecheck, or linting. Do not proceed until the worktree is completely clean and all issues are resolved.
  - [ ] Commit the changes following `AGENTS.md`. Verify that `git status` is clean after committing.
