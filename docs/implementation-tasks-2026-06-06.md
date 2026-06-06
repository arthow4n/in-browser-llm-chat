# Implementation Tasks - Quality Alignment 2026-06-06

## Source

This implementation plan is derived from the code review findings in `docs/code-review-findings-2026-06-06.md`. Its purpose is to bring the existing implementation into full alignment with the strict typing and quality standards specified in the original project plan (`docs/scratchpad.md`), eliminating type bypasses and structural casts.

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Execute tasks in the exact order listed. Do not skip any steps.
2. **Worktree Verification**: After completing the implementation of each step, you MUST verify the worktree state by running:
   - `npm run format`
   - `npm run typecheck`
   - `npm run lint:fix`
   - `npm run test`
   - `npm run build`
3. **Self-Review**: Perform a self-review of the changes before committing to ensure no new type bypasses (like `any` or `as unknown as`) were introduced.
4. **Commit Convention**: Commit each step independently. Use the commit message format specified in `AGENTS.md` (e.g., `(AgentName) Description of change`).
5. **No New Bypasses**: Do not use `any` or structural casting to solve type errors; instead, define the missing types or improve existing ones.

## 1. Typing Improvements in `graphRunnerActor.ts`

### Step 1.1: Define LLM Provider Response Types

Define specific interfaces for Google GenAI and OpenRouter response chunks and usage data in a new types file (e.g., `src/workflow/types.ts`) or within `src/workflow/schemas.ts` to replace `any` usage in the runner.

- [x] Define interfaces for response chunks and usage data.
- [x] Verify worktree state.
- [x] Perform code review.
- [x] Commit the changes.

### Step 1.2: Refactor Helper Functions in `graphRunnerActor.ts`

Update the following helper functions to use the newly defined types instead of `any`:

- `getEventErrorMessage(event: any)`
- `getChunkUsage(chunk: any)`
- `getMessages(out: any)`
- `getInterruptType(activeInterrupt: any)`
- `getEventInterrupt(event: any)`
- `toOpenRouterMessage(msg: any)`

- [x] Refactor each function to use explicit types.
- [x] Verify worktree state.
- [x] Perform code review.
- [x] Commit the changes.

### Step 1.3: Remove `any` eslint-disable in `graphRunnerActor.ts`

Remove the `/* eslint-disable @typescript-eslint/no-explicit-any */` directive from the top of `src/workflow/graphRunnerActor.ts`.

- [x] Remove the eslint-disable comment.
- [x] Verify worktree state (especially `npm run lint:fix`).
- [x] Perform code review.
- [x] Commit the changes.

## 2. Refactoring `ChatInterface.tsx`

### Step 2.1: Improve `ThreadStore` Definition in `db.ts`

Refactor the `ThreadStore` interface in `src/db/db.ts` to use the `WorkflowStore` type for the `workflowSnapshot` field, eliminating the need for casting it as `Record<string, unknown>` in the UI.

- [x] Update `ThreadStore` interface in `src/db/db.ts` to use `WorkflowStore` for `workflowSnapshot`.
- [x] Update usages of `workflowSnapshot` in `src/ui/chat/ChatInterface.tsx` to remove the cast.
- [x] Verify worktree state.
- [x] Perform code review.
- [x] Commit the changes.

### Step 2.2: Fix Structural Casting of `workflowInjected`

In `src/ui/chat/ChatInterface.tsx`, remove the structural cast `workflowInjected as Array<{ content: string; depth: number }>`. Ensure the `Workflow` interface in `src/db/db.ts` (or corresponding type) correctly defines `injectedSystemMessages` to allow the type to propagate naturally to the UI.

- [x] Refactor `workflowInjected` usage.
- [x] Verify worktree state.
- [x] Perform code review.
- [x] Commit the changes.

### Step 2.3: Fix Forced Casting of `messages`

In `src/ui/chat/ChatInterface.tsx`, remove the forced cast `messages as import("../../workflow/compiler").GraphMessage[]`. Ensure the source of `messages` (e.g. the `threads` or `messages` store in `db.ts` or the state machine) uses the `GraphMessage` type.

- [x] Refactor `messages` usage.
- [x] Verify worktree state.
- [x] Perform code review.
- [x] Commit the changes.

### Step 2.4: Fix Forced Casting of `event`

In `src/ui/chat/ChatInterface.tsx`, remove the forced cast `send(event as import("../../workflow/parentCoordinator").CoordinatorEvent)`. Update the event handling logic to use the `CoordinatorEvent` type directly.

- [ ] Refactor `send(event ...)` call to use `CoordinatorEvent`.
- [ ] Verify worktree state.
- [ ] Perform code review.
- [ ] Commit the changes.

## 3. Strict `StateGraph` Typing in `compiler.ts`

### Step 3.1: Define `StateGraph` Types

In `src/workflow/compiler.ts`, define the concrete types for State, Event, and Channels used by the `StateGraph`.

- [ ] Define the required types.
- [ ] Verify worktree state.
- [ ] Perform code review.
- [ ] Commit the changes.

### Step 3.2: Apply Types to `StateGraph` Instantiation

Replace the `any` generics in `new StateGraph<any, any, any, any>(GraphStateAnnotation)` with the types defined in Step 3.1.

- [ ] Update `StateGraph` instantiation.
- [ ] Verify worktree state.
- [ ] Perform code review.
- [ ] Commit the changes.

### Step 3.3: Remove `any` eslint-disable in `compiler.ts`

Remove the `/* eslint-disable @typescript-eslint/no-explicit-any */` directive from `src/workflow/compiler.ts`.

- [ ] Remove the eslint-disable comment.
- [ ] Verify worktree state.
- [ ] Perform code review.
- [ ] Commit the changes.

## 4. Final Verification

### Step 4.1: Full System Check

Perform a final comprehensive check of the entire project to ensure no regressions were introduced.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint:fix`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Commit the final verification.

## 5. Cleanup

- [ ] Delete the findings file from `docs/code-review-findings-2026-06-06.md`.
  - [ ] Delete the findings file.
  - [ ] Commit the deletion.
