# Plan: Programmatic Built-in Workflows

## Goal

Move built-in workflows (Standard Agent, Debate Workflow) from IndexedDB seeding to a programmatic implementation. They should be merged with user-defined workflows at runtime and be non-removable.

## Tasks

### 1. Define Built-in Workflows

- [ ] Create `src/workflow/builtInWorkflows.ts` with definitions for:
  - **Standard Agent**: 1-agent loop.
  - **Debate Workflow**: Initiator -> Debaters (loop) -> Evaluators -> Summarizer.
- [ ] Ensure `isBuiltIn: true` is set for these definitions.

### 2. Implement Workflow Merging Logic

- [ ] Create a helper function `getEffectiveWorkflows()` (perhaps in `src/db/db.ts` or a new `src/workflow/workflowService.ts`) that:
  - Calls `getAllWorkflows()` from DB.
  - Spreads `BUILT_IN_WORKFLOWS` and DB workflows into a single array.
  - Returns the merged list.

### 3. Update UI Components

- [ ] **New Chat Form**:
  - Update `newChatFormMachine.ts` to use `getEffectiveWorkflows()` for the workflow dropdown.
- [ ] **Workflow Manager**:
  - Update `workflowListMachine.ts` to use `getEffectiveWorkflows()`.
  - In `WorkflowList.tsx`, disable/hide the delete button for workflows where `isBuiltIn === true`.
- [ ] **Workflow Editor**:
  - Prevent direct editing of built-in workflows.
  - If a built-in workflow is selected for editing, prompt the user to "Clone" it into a new custom workflow.

### 4. Refactor DB & Seeding

- [ ] Remove any logic in `src/ui/settings/globalSettings.ts` or `src/db/db.ts` that seeds built-in workflows into the `workflows` store.
- [ ] Ensure `deleteWorkflow` in `db.ts` remains as a safety guard, although the UI should prevent calls for built-in IDs.

### 5. Thread Integration

- [ ] Verify `createNewThread` correctly captures the `workflowSnapshot` from the merged list, ensuring stability for active threads.

### 6. Testing & Verification

- [ ] Verify built-in workflows appear immediately on a fresh DB.
- [ ] Verify custom workflows are persisted and retrieved.
- [ ] Verify built-in workflows cannot be deleted via UI.
- [ ] Verify thread creation works for both built-in and custom workflows.
