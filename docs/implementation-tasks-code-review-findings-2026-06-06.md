# Implementation Tasks: Code Review Findings (2026-06-06)

**Source:** `docs/code-review-findings-2026-06-06.md`

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Execute tasks one by one in the order they appear. Do not skip steps.
2. **Verify Worktree State**: For every step, run the verification commands (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`) and fix any issues before proceeding.
3. **Code Review**: Self-review your changes against the original requirements and no-bypasses policy.
4. **Commit Conventions**: Commit your changes at the end of each step following the `AGENTS.md` guidelines (e.g., using the proper agent prefix).

## 1. Fix Type Bypasses (`as any`, `as unknown as`)

- [x] **Step 1.1:** Fix type bypass in `src/workflow/parentCoordinator.graph.test.ts`
  - [x] Replace `as any` (Line 84) with properly typed mocks or valid object structures.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

- [x] **Step 1.2:** Fix type bypass in `src/ui/chat/ChatInputArea.test.tsx`
  - [x] Replace `as unknown as` (Line 95) with properly typed mocks or valid object structures.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

## 2. Fix Structural Type Casting

- [x] **Step 2.1:** Fix structural type casting in `src/db/checkpointer.ts`
  - [x] Define explicit `interface` or `type` definitions and use type guards or Zod schema validation to replace `as { type: string; value: Uint8Array }` on Lines 44, 45, 56, 236, 237, 256.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

- [x] **Step 2.2:** Fix structural type casting in `src/ui/ChatMessage.tsx`
  - [x] Define explicit `interface` or `type` definitions and use type guards or Zod schema validation to replace structural cast on Line 276.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

- [x] **Step 2.3:** Fix structural type casting in `src/ui/ErrorBubble.tsx`
  - [x] Define explicit `interface` or `type` definitions and use type guards or Zod schema validation to replace structural cast on Line 62.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

- [ ] **Step 2.4:** Fix structural type casting in `src/ui/chat/ChatInputArea.tsx`
  - [ ] Define explicit `interface` or `type` definitions and use type guards or Zod schema validation to replace structural cast on Line 38.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

## 3. Fix UI State Machine Policy Violations (`useState` Usage)

- [ ] **Step 3.1:** Migrate state in `src/App.tsx`
  - [ ] Create an XState machine to manage `isSidebarOpen` and migrate the component from `useState` to `@xstate/react`.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.2:** Migrate state in `src/ui/AskQuestionsForm.tsx`
  - [ ] Create an XState machine to manage `answers` and migrate the component from `useState` to `@xstate/react`.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.3:** Migrate display/visibility state in `src/ui/chat/ChatInterface.tsx`
  - [ ] Create a new XState state machine for `ChatInterface` to manage display/visibility state (`showSettings`, `showPayloadPreview`).
  - [ ] Migrate the component to use the new machine.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.4:** Migrate preview state in `src/ui/chat/ChatInterface.tsx`
  - [ ] Extend the `ChatInterface` state machine to manage preview state (`previewAgentId`, `previewPayload`).
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.5:** Migrate chat data state in `src/ui/chat/ChatInterface.tsx`
  - [ ] Extend the `ChatInterface` state machine to manage chat data state (`thread`, `messages`, `draftAnswers`).
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.6:** Migrate configuration state in `src/ui/chat/ChatInterface.tsx`
  - [ ] Extend the `ChatInterface` state machine to manage configuration state (`presets`, `nodes`, `globalInjectedMessages`).
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.7:** Migrate state in `src/ui/chat/ExecutionControlPanel.tsx`
  - [ ] Create an XState machine to manage `isModalOpen` and migrate the component from `useState` to `@xstate/react`.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.8:** Migrate state in `src/ui/settings/ApiKeyInput.tsx`
  - [ ] Create an XState machine to manage `debouncedValue` and migrate the component from `useState` to `@xstate/react`.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

- [ ] **Step 3.9:** Migrate state in `src/ui/settings/PresetConfig.tsx`
  - [ ] Create an XState machine to manage `isCustomModel`, `customModelId` and migrate the component from `useState` to `@xstate/react`.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.

## 4. Final Cleanup

- [ ] Move the findings file (`docs/code-review-findings-2026-06-06.md`) to the `docs.outdated` directory.
  - [ ] Move findings file to `docs.outdated/`.
  - [ ] Commit the movement of the findings file.
- [ ] Delete the findings file from `docs.outdated/`.
  - [ ] Delete the findings file.
  - [ ] Commit the deletion.
- [ ] Delete this implementation tasks file.
  - [ ] Remove `docs/implementation-tasks-code-review-findings-2026-06-06.md`.
  - [ ] Commit the deletion.
