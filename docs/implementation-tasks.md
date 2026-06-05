# Implementation Tasks

This document contains a step-by-step checklist to build the LLM chat application according to the specifications in `docs/scratchpad.md`.

**Rules for the Coding Agent:**

1. Pick one step at a time. Do NOT implement multiple steps at once.
2. Follow the exact specification from `docs/scratchpad.md` for each step. Do NOT add features not requested.
3. Write tests for the logic implemented in each step, adhering to the Testing Guidelines in `docs/scratchpad.md`. Emphasize integration tests using `msw` for API mocking, explore `@xstate/graph` for state machine model-based testing, and strictly avoid general-purpose mocks.
4. After completing the implementation and tests for a step, verify the worktree state is clean:
   - Run formatting (`npm run format`)
   - Run type-check (`npm run typecheck`)
   - Run lint with autofix (`npm run lint:fix`)
   - Run tests (`npm run test`)
   - Ensure a successful build (`npm run build`)
5. **Code Review**: Before committing, invoke a `self` subagent to code review your work. Instruct the subagent to verify that the implementation adheres strictly to the plan in `docs/scratchpad.md` and that the tests provide meaningful coverage of actual usages. Address any issues identified during this review.
6. Create a Git commit for the step following the conventions in `AGENTS.md`.
7. Mark the step as `[x]` in this checklist and proceed to the next step.

---

## 1. Project Scaffolding & Dependencies

- [x] **Step 1.1:** Install the required dependencies specified in the scratchpad (e.g., `@langchain/langgraph/web`, `xstate`, `@xstate/react`, `@carbon/react`, `zod`, `idb`, `fake-indexeddb`, `@google/genai`, `@openrouter/sdk`, `react-markdown`, `rehype-katex`, `remark-gfm`, `remark-math`, `msw`, `@xstate/graph`). Ensure `oxlint` (specifically `oxlint-tsgolint@latest`), `oxfmt`, and `@typescript/native-preview` are configured according to `AGENTS.md` and the tech stack in `docs/scratchpad.md`.
- [x] **Step 1.2:** Configure Vite, import Carbon Design system styles (`@carbon/styles`), and build the basic Carbon layout shell in the main entry point (`index.tsx` or `App.tsx`). Do NOT add any glassmorphism or custom fonts.

## 2. Database Layer (IndexedDB)

- [x] **Step 2.1:** Implement the database schema and initialization logic using `idb` inside `src/db/index.ts`. Create stores for `settings`, `presets`, `workflows`, `threads`, `messages`, `checkpoints`, and `checkpoint_writes` exactly as specified in the "Database Schema" section.
- [x] **Step 2.2:** Implement database helper functions for CRUD operations on all stores, ensuring to use transaction sweeps for initialization errors or cascading deletes (e.g., thread deletion batched chunks). Write integration tests using `fake-indexeddb` to verify the DB wrapper logic.

## 3. LangGraph Checkpointer & Graph Factory

- [x] **Step 3.1:** Implement the custom IndexedDB checkpointer class for LangGraph that extends `BaseCheckpointSaver`. Ensure it correctly maps to the `checkpoints` and `checkpoint_writes` stores.
- [ ] **Step 3.2:** Implement the Workflow Schema parsing logic (using Zod) and the dynamic `StateGraph` compilation factory function. Implement the routing rules (e.g., `on_tool_call`, `on_consensus`) and the execution logic for `agent`, `input`, `tool`, `consensus_check`, and `summary` nodes as outlined in the "Custom Workflow JSON Serialization" section. Write tests for graph compilation.

## 4. Execution State Machine & Runner Actor

- [ ] **Step 4.1:** Implement the `graphRunnerActor` state machine. It should handle LangGraph `stream()` execution, manage API chunk buffering, handle LLM API limits/budget policies, execute tools, and handle `PAUSE`/`INTERRUPT` logic.
- [ ] **Step 4.2:** Implement the `ExecutionState` parallel region of the Parent Coordinator machine. Ensure it orchestrates the `graphRunnerActor`, manages `checkingStatus`, `executing`, `awaitingHumanInput`, and `error` states, and appropriately saves execution statuses to IndexedDB.

## 5. View State Machine (Parent Coordinator) & Routing

- [ ] **Step 5.1:** Implement the `ViewState` parallel region of the Parent Coordinator machine, covering `initializing`, `onboarding`, `idle`, `chatting`, `presetConfig`, `workflowConfig`, and `globalSettings` states. Utilize `@xstate/graph` for testing where appropriate.
- [ ] **Step 5.2:** Integrate the Parent Coordinator machine into the root React layout. Set up React Router, binding route changes to `ROUTE_CHANGED` events sent to the Parent Coordinator machine to decouple view navigation from background execution.

## 6. Global Settings & Presets Management

- [ ] **Step 6.1:** Build the Global Settings State Machine and its UI form component. Include password-masked fields for OpenRouter and Gemini API keys, theme override selectors, and system message definitions. Implement the API key validation logic and connection tester.
- [ ] **Step 6.2:** Build the Preset List View State Machine and its UI component. Support sorting, pagination, and deletion safety guards.
- [ ] **Step 6.3:** Build the Preset Connection Tester State Machine and the Preset Config UI form for creating/editing LLM configurations.

## 7. Workflow Management UI

- [ ] **Step 7.1:** Build the Custom Workflow List View State Machine and its UI component. Handle sorting, searching, and deletion guards.
- [ ] **Step 7.2:** Build the Workflow JSON Editor State Machine and its UI component (Textarea editor). Implement structural validation feedback (using Zod logic from Step 3.2) to block saving invalid graph topologies.

## 8. Thread Management & Left Sidebar

- [ ] **Step 8.1:** Build the Left Sidebar State Machine and UI component for listing threads. Implement pagination, sorting, search, and cascading deletes (batched asynchronously).
- [ ] **Step 8.2:** Build the New Chat Form State Machine and UI component, populating workflow and preset dropdowns. Ensure submitting a new chat correctly seeds the thread and routes the user.
- [ ] **Step 8.3:** Build the Thread Settings Modal State Machine and UI for renaming, switching active presets, and invoking "Soft/Hard Sync" workflows logic or checkpoint compaction.

## 9. Chat Feed & Message Components

- [ ] **Step 9.1:** Implement the main Chat Feed auto-scroll state machine and message list renderer. Build the Carbon-styled message bubbles displaying markdown and LaTeX.
- [ ] **Step 9.2:** Build the Multi-Agent Render State logic for message bubbles, showing agent names/avatars and nested tool calls. Include the Code Block Control State Machine for copying/downloading code.
- [ ] **Step 9.3:** Implement the Chat Input Area State Machine and UI, handling user inputs, role selection, and mobile layout constraints.

## 10. Interactive Tools & Inline Cards

- [ ] **Step 10.1:** Implement the `ask_questions` Tool Form State Machine and UI component. Render it interactively inside the chat feed to update draft answers in the DB, and handle final submission formatting.
- [ ] **Step 10.2:** Implement the Proposed Action Card (Approval Form) State Machine for database-modifying tools. Build the visual diff UI and confirmation logic.
- [ ] **Step 10.3:** Implement the Budget Exceeded Card State Machine for handling execution limits, and the Inline Error Bubble controls for retrying LLM steps.

## 11. Final Integration & Polish

- [ ] **Step 11.1:** Integrate the Execution & Loop Control Panel State Machine (floating panel/mobile overlay) to allow users to Pause, Resume, Abort, Force Consensus, or Force Summarize.
- [ ] **Step 11.2:** Integrate the API Payload Preview Modal State Machine and the Chat Header Quick Preset Switcher State Machine.
- [ ] **Step 11.3:** Perform a final review of the empty states, loading skeletons, error fallbacks, and mobile constraints as dictated by the "Global UX/UI Guidelines" in the scratchpad. Fix any UI misalignments to purely use Carbon Design elements.
