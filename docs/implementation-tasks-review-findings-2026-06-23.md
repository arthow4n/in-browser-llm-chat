# Implementation Tasks: Code & Business Logic Review Findings

This document outlines the detailed, step-by-step checklist to implement the fixes and missing chat pages identified in [review-findings-2026-06-23.md](file:///home/hevar/git/in-browser-llm-chat/docs/review-findings-2026-06-23.md).

---

## Source Context & Requirements

- **Source Plan**: Critical Code & Business Logic Review Findings ([review-findings-2026-06-23.md](file:///home/hevar/git/in-browser-llm-chat/docs/review-findings-2026-06-23.md)).
- **Goal**: Make the chat interface functional, clean up settings panel visual clutter/double-headers, resolve the standard-1-agent workflow snapshot compiler error, and implement new thread setup page.

---

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Implement the steps in exact sequential order. Do not skip steps or work on later steps before completing previous ones.
2. **Verify Worktree State**: For every step, run quality validation tools (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`) before proceeding to ensure no regression or lint failures.
3. **Code Review**: Critically inspect your changes or use a research subagent to review logic before committing.
4. **Commit Conventions**: Commit after each completed step. Prefix the commit message with `(Antigravity/Gemini 3.5 Flash (Medium)) Step X.Y: <action>`.

---

## Implementation Tasks

### Phase 1: Fix Configuration Bug & Built-in Snapshots

#### - [x] **Step 1.1: Correct default standard-1-agent workflow snapshot in layout-machine.ts**

- **Description**: The default snapshot for `"standard-1-agent"` in the `createThreadActor` has an invalid structure (`type: "llm"`, `config.prompt`) that crashes the compiler. Update it to conform to the compiler specs (using `type: "agent"` and `systemPrompt`).
- **Files**:
  - [layout-machine.ts](file:///home/hevar/git/in-browser-llm-chat/src/layout/layout-machine.ts#L203-L206) (Update `workflowSnapshot` inside the promise actor)
- **Specifications**:
  - Change `{ id: "agent", type: "llm", config: { prompt: "You are a helpful assistant." } }` to `{ id: "agent", type: "agent", name: "Agent", systemPrompt: "You are a helpful assistant." }`.
- **Verification Checklist**:
  - [ ] Verify node changes compiles against graph compiler.
  - [ ] Run formatting and check style rules: `npm run format`.
  - [ ] Verify typecheck: `npm run typecheck`.
  - [ ] Apply autofix lints: `npm run lint:fix`.
  - [ ] Run tests: `npm run test`.
  - [ ] Verify production build: `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 1.1: Correct default standard-1-agent workflow snapshot in layout-machine.ts`.

---

### Phase 2: Refactor Settings and Onboarding View

#### - [ ] **Step 2.1: Add mode prop to SettingsComponent and hide advanced views in Onboarding**

- **Description**: Allow SettingsComponent to render in onboarding mode by hiding advanced configuration blocks (Appearance, Storage, system messages) when it is mounted inside the onboarding screen overlay.
- **Files**:
  - [settings-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/settings/settings-component.tsx)
- **Specifications**:
  - Define a `mode?: "onboarding" | "global"` property in `SettingsComponentProps`.
  - If `mode === "onboarding"`, conditionally omit sections for theme, storage settings, system message list, and the "Reset Fields" footer button.
  - Also hide the `<h2>Global Settings</h2>` header title block and subtitle entirely under onboarding mode.
- **Verification Checklist**:
  - [ ] Verify settings fields render correctly under both global settings view and onboarding overlay.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 2.1: Add mode prop to SettingsComponent and hide advanced views in Onboarding`.

#### - [ ] **Step 2.2: Pass mode prop in app-component.tsx**

- **Description**: Mount the Settings component in the correct mode depending on whether the user is in onboarding state or visiting the settings route.
- **Files**:
  - [app-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/app/app-component.tsx)
- **Specifications**:
  - In `appState.matches("onboarding")`, render `<SettingsComponent mode="onboarding" ... />`.
  - In the route `/settings`, render `<SettingsComponent mode="global" ... />`.
- **Verification Checklist**:
  - [ ] Verify onboarding card operates without errors.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 2.2: Pass mode prop in app-component.tsx`.

#### - [ ] **Step 2.3: Remove redundant card-level headers in Global Settings view**

- **Description**: Hide the card title header from SettingsComponent when running in `"global"` mode, preventing double headers on the settings page.
- **Files**:
  - [settings-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/settings/settings-component.tsx)
- **Specifications**:
  - If `mode === "global"`, conditionally hide the settings card `<header className="settings-header">` container since the Layout component's navbar already displays the "Global Settings" title.
- **Verification Checklist**:
  - [ ] Verify the double-header is gone and margins align properly.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 2.3: Remove redundant card-level headers in Global Settings view`.

#### - [ ] **Step 2.4: Polish settings panel visuals, inputs and layouts**

- **Description**: Upgrade unstyled eye/monkey toggles and delete buttons inside settings rows to use modern CSS layouts or SVGs, aligning with high-quality design principles.
- **Files**:
  - [settings-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/settings/settings-component.tsx)
  - [index.css](file:///home/hevar/git/in-browser-llm-chat/src/index.css)
- **Specifications**:
  - Refactor emoji buttons (`👁`/`🙈` and `🗑`) to styled HTML buttons with SVG icons or high-quality CSS layouts.
  - Ensure a minimum `44x44px` touch target size is applied.
- **Verification Checklist**:
  - [ ] Verify visual alignment of the API fields and action buttons.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 2.4: Polish settings panel visuals, inputs and layouts`.

---

### Phase 3: Implement Main Chat View & Runner Actor Integration

#### - [ ] **Step 3.1: Create ChatComponent and register it in routes**

- **Description**: Create the main chat feed page component to replace the placeholder routing element.
- **Files**:
  - Create `src/threads/chat-component.tsx`
  - [app-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/app/app-component.tsx) (Register new component in routing index)
- **Specifications**:
  - Read `threadId` using React Router `useParams`.
  - Query thread and messages history from IndexedDB via `getThread` and `listMessages`.
  - Set up a scrollable message list feed area.
- **Verification Checklist**:
  - [ ] Verify route compiles and rendering runs.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.1: Create ChatComponent and register it in routes`.

#### - [ ] **Step 3.2: Spawn graph-runner-actor.ts and coordinate execution**

- **Description**: Integrate the background executor graph runner into the thread chat interface, hooking up execution states (executing, paused, errors).
- **Files**:
  - `src/threads/chat-component.tsx`
- **Specifications**:
  - Instatiate or spawn the execution actor (`graphRunnerActor` from [graph-runner-actor.ts](file:///home/hevar/git/in-browser-llm-chat/src/threads/graph-runner-actor.ts)) for the active thread.
  - Coordinate message append events, status writes, and error handling.
- **Verification Checklist**:
  - [ ] Verify execution runner operates correctly when starting/resuming.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.2: Spawn graph-runner-actor.ts and coordinate execution`.

#### - [ ] **Step 3.3: Mount LoopControlPanel and bind controls**

- **Description**: Hook up the loop control panel component at the top of the chat area, managing execution stats and loop overrides.
- **Files**:
  - `src/threads/chat-component.tsx`
- **Specifications**:
  - Render `<LoopControlPanel>` passing stats (`currentRound`, `turnCount`, `tokenStats`).
  - Bind Pause, Resume, Abort, Force Consensus, and Summarize early actions.
- **Verification Checklist**:
  - [ ] Verify loop panel button actions interact cleanly with thread execution.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.3: Mount LoopControlPanel and bind controls`.

#### - [ ] **Step 3.4: Integrate message feed list and option options**

- **Description**: Display agent and user conversation messages using the bubble component and enable manual editing and rewinding.
- **Files**:
  - `src/threads/chat-component.tsx`
- **Specifications**:
  - Map and render messages via [message-bubble-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/threads/message-bubble-component.tsx).
  - Wire options menus (Edit, Delete, Branch) to trigger database truncation, checkpoint rollbacks, and feed updates.
- **Verification Checklist**:
  - [ ] Verify deleting or editing a message rewinds history correctly.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.4: Integrate message feed list and option options`.

#### - [ ] **Step 3.5: Support inline interrupt form cards**

- **Description**: Render interactive tool prompt widgets (such as questions or approvals) directly inside the chat feed when execution halts.
- **Files**:
  - `src/threads/chat-component.tsx`
- **Specifications**:
  - Render `<AskQuestionsComponent>` when active interrupt type is `"ask_questions"`.
  - Render `<ProposalComponent>` when interrupt is `"approval"`.
  - Render `<BudgetExceededCard>` when token limits are hit.
- **Verification Checklist**:
  - [ ] Verify interactive card selections resolve the blocked runner state.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.5: Support inline interrupt form cards`.

#### - [ ] **Step 3.6: Mount ChatInputComponent and bind submits**

- **Description**: Add the bottom chat input form to the chat view, supporting role selection and dynamic resizing.
- **Files**:
  - `src/threads/chat-component.tsx`
- **Specifications**:
  - Mount `<ChatInputComponent>` at the bottom of the viewport.
  - Wire submissions to write new message records and trigger graph execution runs.
- **Verification Checklist**:
  - [ ] Verify submitting a message starts agent processing.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 3.6: Mount ChatInputComponent and bind submits`.

---

### Phase 4: Implement "New Chat" Selection UI

#### - [ ] **Step 4.1: Create NewChatComponent and hook up index routing**

- **Description**: Build the initial "New Chat" setup screen where users select workflows, choose presets, and write the initial chat prompt to initialize a conversation thread.
- **Files**:
  - Create `src/threads/new-chat-component.tsx`
  - [app-component.tsx](file:///home/hevar/git/in-browser-llm-chat/src/app/app-component.tsx) (Update routes index layout element)
- **Specifications**:
  - Map the default index path (`/`) to `<NewChatComponent>`.
  - Render dropdowns to select workflows (Standard vs Debate) and active presets.
  - Render a text prompt input field and submit button.
  - On submit, compile thread, write `workflowSnapshot` to IndexedDB, navigate to thread ID, and launch background graph execution.
- **Verification Checklist**:
  - [ ] Verify submitting starts the correct seeded workflow execution flow.
  - [ ] Run checks: `npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`.
  - [ ] Perform code review.
  - [ ] Commit changes: `(Antigravity/Gemini 3.5 Flash (Medium)) Step 4.1: Create NewChatComponent and hook up index routing`.
