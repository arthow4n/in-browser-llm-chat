# Implementation Tasks

This document contains a step-by-step checklist to resolve the issues found in `docs/code-review-findings-20260606-01.md`.

**Rules for the Coding Agent:**

1. **Strict Sequential Execution:** Pick only one step/substep at a time. Do NOT implement multiple steps at once. The coding agent must run only 1 checklist item at a time and check it off immediately before taking or proceeding to the next item.
2. Follow the exact specification for each step. Do NOT add features not requested.
3. Write tests for the logic implemented in each step, adhering to the Testing Guidelines. Emphasize integration tests using `msw` for API mocking, explore `@xstate/graph` for state machine model-based testing, and strictly avoid general-purpose mocks.
4. After completing the implementation and tests for a step, verify the worktree state is clean:
   - Run formatting (`npm run format`)
   - Run type-check (`npm run typecheck`)
   - Run lint with autofix (`npm run lint:fix`)
   - Run tests (`npm run test`)
   - Ensure a successful build (`npm run build`)
5. **Code Review**: If you have a tool for invoking a subagent, then before committing, invoke a subagent to code review your work using the `code-review` skill. The reviewing prompt to the subagent should also point to the findings and the current step being done. The main point of the review is to ensure the code is coherent, logically correct and that there are no bypasses which will later need to be cleaned up by the `code-cleanup` skill. Address any issues identified during this review. Otherwise do the review yourself.
6. Create a Git commit for the step following the conventions in `AGENTS.md`. The commit message should be a gist of what you have done, instead of the step name.
7. Mark the step as `[x]` in this checklist and proceed to the next step.

---

## 1. Fix Type Safety Bypasses

- [x] **Step 1.1:** Refactor `src/ui/chat/ChatInputArea.test.tsx` to remove ESLint disable comments for `no-explicit-any` and replace `as any` in `createMockState` with properly typed XState context and state structure.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 1.2:** Refactor `src/workflow/graphRunnerActor.ts` to remove the ESLint disable comment and pass a correctly typed payload to LangGraph instead of bypassing the type checker (`payload as any`).
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

## 2. Fix No-Mocking Policy Violations

- [x] **Step 2.1:** Remove UI module mocks (`@carbon/react` and `@carbon/icons-react`) from `src/ui/CodeBlock.test.tsx` and attempt to render the real components during testing.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 2.2:** If DOM limitations prevent rendering the Carbon components in `src/ui/CodeBlock.test.tsx`, configure Vitest/JSDOM properly or refactor it into an integration test using `msw` or proper DOM environments.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

## 3. Fix XState Snapshot Checks

- [x] **Step 3.1:** Refactor `src/ui/settings/ApiKeyInput.tsx` to use `snapshot.matches()` instead of `snapshot.value ===`.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 3.2:** Refactor `src/ui/settings/PresetConfig.tsx` to use `snapshot.matches()` instead of `snapshot.value ===`.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 3.3:** Refactor `src/ui/chat/ThreadSettingsModal.tsx` to use `snapshot.matches()` instead of `snapshot.value ===`.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 3.4:** Refactor `apiKeyValidator.test.ts` to assert using `.matches()` instead of `.value`.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 3.5:** Refactor `chatInputMachine.test.ts` to assert using `.matches()` instead of `.value`.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.
- [x] **Step 3.6:** Perform a codebase-wide search for any other remaining instances of `state.value ===`, `snapshot.value ===`, or `actor.getSnapshot().value` (including in test files). Identify and list the files requiring modification.
  - [x] Implement the logic/feature.
  - [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [x] Perform code review (self/subagent).
  - [x] Commit the changes following `AGENTS.md`.

**Files identified requiring modification:**
- `src/machines/proposedActionCardMachine.test.ts`
- `src/ui/settings/globalSettings.test.ts`
- `src/ui/settings/presetConfigMachine.test.ts`
- `src/ui/settings/presetConnectionTester.test.ts`
- `src/ui/settings/presetListMachine.test.ts`
- `src/ui/sidebar/leftSidebarMachine.test.ts`
- `src/ui/workflow/WorkflowEditor.tsx`
- `src/ui/workflow/workflowListMachine.test.ts`
- `src/workflow/graphRunnerActor.test.ts`
- `src/workflow/parentCoordinator.graph.test.ts`
- [ ] **Step 3.7:** Replace the remaining instances identified in Step 3.6 with `.matches()` across all affected files, ensuring tests are also updated to assert using `.matches()`.
  - [ ] Implement the logic/feature.
  - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
  - [ ] Perform code review (self/subagent).
  - [ ] Commit the changes following `AGENTS.md`.
