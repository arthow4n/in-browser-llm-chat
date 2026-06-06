# Implementation Tasks: Programmatic Built-in Workflows

**Source Plan**: `docs/programmatic-workflows-plan.md`

## Rules for the Coding Agent
- **Strict Sequential Execution**: Complete tasks in the exact order listed. Do not skip steps.
- **Worktree Verification**: After each step, run the following quality checks to ensure the workspace remains clean:
  - `npm run format`
  - `npm run typecheck`
  - `npm run lint:fix`
  - `npm run test`
  - `npm run build`
- **Code Review**: Perform a self-review or use a subagent for code review before committing.
- **Commit Conventions**: Every completed step must be committed individually following the conventions in `AGENTS.md`.
- **No Barrel Files**: Do not create or use `index.ts` files for exports.
- **No Default Exports**: Use only named exports.

## 1. Workflow Definitions
- [ ] **Step 1.1: Create Built-in Workflow Definitions**
  - Create `src/workflow/builtInWorkflows.ts`.
  - Define a constant `BUILT_IN_WORKFLOWS` using the `WorkflowStore` interface from `src/db/db.ts`, containing the definitions for:
    - **Standard Agent**: A simple 1-agent loop.
    - **Debate Workflow**: A workflow consisting of Initiator -> Debaters (loop) -> Evaluators -> Summarizer.
  - Ensure each definition includes `isBuiltIn: true` and a unique `id` that does not conflict with typical user-generated IDs (e.g., prefix with `builtin-`).
  - [ ] Implement the definitions.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 2. Workflow Merging Logic
- [ ] **Step 2.1: Create Workflow Service**
  - Create `src/workflow/workflowService.ts`.
  - Implement a function `getEffectiveWorkflows()` that:
    - Fetches all workflows from the database using `getAllWorkflows()`.
    - Filters out any workflows from the database that are marked as `isBuiltIn: true` to prevent duplicates with the programmatic definitions.
    - Merges the filtered result with the `BUILT_IN_WORKFLOWS` array.
    - Returns the combined list of workflows.
  - [ ] Implement `getEffectiveWorkflows()` in `src/workflow/workflowService.ts`.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 3. UI Integration - New Chat Form
- [ ] **Step 3.1: Update New Chat Workflow Selection**
  - Update `src/ui/chat/newChatFormMachine.ts` (or the corresponding machine for the New Chat form).
  - Replace the logic that fetches workflows for the dropdown with a call to `getEffectiveWorkflows()`.
  - Ensure the UI correctly displays both built-in and custom workflows.
  - [ ] Update `newChatFormMachine.ts`.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 4. UI Integration - Workflow Manager
- [ ] **Step 4.1: Update Workflow List Machine**
  - Update `src/ui/workflow/workflowListMachine.ts` (or the corresponding machine for the Workflow List).
  - Replace the logic that fetches workflows for the list with a call to `getEffectiveWorkflows()`.
  - [ ] Update `workflowListMachine.ts`.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

- [ ] **Step 4.2: Protect Built-in Workflows in UI**
  - Update `src/ui/workflow/WorkflowList.tsx` (or the corresponding component).
  - Locate the delete button/action for workflows.
  - Disable or hide the delete button if the workflow has `isBuiltIn === true`.
  - [ ] Implement UI protection for built-in workflows.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 5. UI Integration - Workflow Editor
- [ ] **Step 5.1: Prevent Editing of Built-in Workflows**
  - Update the Workflow Editor component and its associated state machine.
  - If a workflow with `isBuiltIn === true` is selected for editing:
    - Set the editor to read-only mode.
    - Display a notification or prompt informing the user that built-in workflows cannot be edited.
    - Provide a "Clone" button that creates a new custom workflow (using the same configuration but with `isBuiltIn: false` and a new UUID), saves it to the database, and switches the editor to the newly created workflow.
  - [ ] Implement read-only mode and cloning for built-in workflows.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 6. Database Refactoring & Seeding Cleanup
- [ ] **Step 6.1: Remove Built-in Workflow Seeding**
  - Identify and remove any code in `src/ui/settings/globalSettings.ts`, `src/db/db.ts`, or other initialization scripts that seeds the default workflows (Standard Agent, Debate) into IndexedDB.
  - Ensure that the `workflows` store only contains user-created workflows moving forward.
  - Verify that `deleteWorkflow` in `src/db/db.ts` handles cases where the workflow to be deleted is not present in the DB (which will be the case for programmatic built-in workflows).
  - [ ] Remove seeding logic.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 7. Thread Integration & Stability
- [ ] **Step 7.1: Verify Workflow Snapshot Capture**
  - Review the `createNewThread` logic.
  - Ensure that when a thread is created, the `workflowSnapshot` is captured from the merged list provided by `getEffectiveWorkflows()`.
  - This ensures that even if a built-in workflow definition changes in the code later, existing threads remain stable with the snapshot they were created with.
  - [ ] Verify/Update `createNewThread` logic.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## 8. Testing & Verification
- [ ] **Step 8.1: End-to-End Verification**
  - Open the application with a fresh database.
  - Verify that "Standard Agent" and "Debate Workflow" are present and selectable.
  - Create a custom workflow and verify it persists across refreshes.
  - Verify that built-in workflows cannot be deleted or edited.
  - Verify that cloning a built-in workflow creates a new, editable custom workflow.
  - Verify that threads can be created using both built-in and custom workflows.
  - [ ] Perform all verification steps.
  - [ ] Verify worktree state.
  - [ ] Perform code review.
  - [ ] Commit changes.

## Final Cleanup
- [ ] Move the plan file (`docs/programmatic-workflows-plan.md`) to the `docs.outdated` directory.
  - [ ] Move plan file to `docs.outdated/`.
  - [ ] Commit the movement of the plan file.
- [ ] Delete the plan file from `docs.outdated/`.
  - [ ] Delete the plan file.
  - [ ] Commit the deletion.
