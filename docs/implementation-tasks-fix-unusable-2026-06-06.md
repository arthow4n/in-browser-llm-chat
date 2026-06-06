# Implementation Tasks: Fix Unusable Application State

## Source

Findings from `docs/business-logic-review-findings-2026-06-06.md`:

- Critical: Multiple `parentCoordinatorMachine` Instances leading to state desynchronization.
- Missing Global Settings Trigger in `HeaderGlobalBar`.
- Inconsistent State Access and View State Integration.

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Tasks must be completed in the order listed. Do not skip ahead.
2. **Worktree Verification**: After each step, verify the state of the worktree using:
   - `npm run format`
   - `npm run typecheck`
   - `npm run lint:fix`
   - `npm run test` (if applicable)
   - `npm run build`
3. **Atomic Commits**: Each step should be committed independently with a descriptive message following the conventions in `AGENTS.md`.
4. **No Default Exports**: Use only named exports and imports.
5. **No Barrel Files**: Avoid `index.ts` files; import from specific files.

## 1. Global State Provider for `parentCoordinatorMachine`

### Step 1.1: Create Coordinator Context

Implement a React Context to share the `parentCoordinatorMachine` instance across the application.

- [x] Create `src/context/CoordinatorContext.tsx`.
- [x] Define `CoordinatorContext` containing the XState `state` and `send` function.
- [x] Implement `CoordinatorProvider` component that:
  - Initializes `parentCoordinatorMachine` using `useMachine`.
  - Provides the state and send function via the context.
- [x] Implement `useCoordinator` custom hook for easy access to the coordinator state and send function.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Create CoordinatorContext for global state management`.

### Step 1.2: Wrap App with CoordinatorProvider

Ensure the entire application is wrapped in the new provider.

- [x] Update `src/App.tsx` to wrap the component tree with `CoordinatorProvider`.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Wrap App with CoordinatorProvider`.

### Step 1.3: Refactor `App.tsx` to use `useCoordinator`

Replace the local machine instance in `App.tsx` with the global one.

- [x] Remove `useMachine(parentCoordinatorMachine)` from `src/App.tsx`.
- [x] Use `useCoordinator()` to obtain `state` and `send`.
- [x] Ensure the `useEffect` for `ROUTE_CHANGED` continues to work with the global `send` function.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Refactor App.tsx to use global coordinator`.

### Step 1.4: Refactor `ChatInterface.tsx` to use `useCoordinator`

Replace the local machine instance in `ChatInterface.tsx` to fix state desynchronization.

- [x] Open `src/ui/chat/ChatInterface.tsx`.
- [x] Remove `useMachine(parentCoordinatorMachine)`.
- [x] Use `useCoordinator()` to obtain the global coordinator state and send function.
- [x] Verify that `currentThreadId` is now correctly synchronized with the state in `App.tsx`.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Refactor ChatInterface.tsx to use global coordinator`.

## 2. Global Settings Integration

### Step 2.1: Implement Settings Button in `HeaderGlobalBar`

Add a way for users to trigger the global settings view.

- [x] Locate the `HeaderGlobalBar` component (either in `src/App.tsx` or a separate file).
- [x] Add a Carbon `Button` inside `<HeaderGlobalBar>`.
- [x] Use `useCoordinator().send` to dispatch the `OPEN_SETTINGS` event when the button is clicked.
- [x] Apply appropriate Carbon Design System styling for the button.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Add Global Settings button to HeaderGlobalBar`.

### Step 2.2: Integrate `ViewState` with Root Rendering

Ensure that the machine's `ViewState` actually controls the visibility of settings and config views.

- [x] In `src/App.tsx`, access the global state using `useCoordinator()`.
- [x] Ensure that the following components are imported and rendered conditionally based on the `ViewState`:
  - `globalSettings` state -> `GlobalSettings` (from `src/ui/settings/GlobalSettings.tsx`)
  - `presetConfig` state -> `PresetConfig` (from `src/ui/settings/PresetConfig.tsx`)
  - `workflowConfig` state -> The appropriate workflow configuration view (from `src/ui/workflow/`)
- [x] Render these components as overlays or root-level views in `src/App.tsx` when their respective states are active.
- [x] Verify that the `OPEN_SETTINGS` event now results in the `GlobalSettings` UI being displayed.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run build`).
- [x] Commit: `(Agent Name) Render settings and workflow views based on ViewState`.

## 3. Verification and Final Testing

### Step 3.1: Verify Thread Synchronization and Chatting

Confirm that the primary "unusable" issue is resolved.

- [x] Load the app and navigate to a thread via URL.
- [x] Verify that `ChatInputArea` (in `src/ui/chat/ChatInputArea.tsx`) no longer logs "No active thread selected" and allows sending messages.
- [x] Verify that changing the route updates the coordinator state globally.

### Step 3.2: Verify Settings and Onboarding Flow

Confirm that the configuration path is accessible.

- [x] Click the Global Settings button and verify the settings UI appears.
- [x] Clear API keys (if possible) and verify the app enters the `onboarding` state.
- [x] Verify that the user can transition from `onboarding` to `globalSettings` to provide keys.

### Step 3.3: Final Build and Smoke Test

- [x] Run `npm run build` to ensure no regression.
- [x] Perform a final manual smoke test of the core chat loop.

## 4. Cleanup

- [x] Move the findings file (`docs/business-logic-review-findings-2026-06-06.md`) to the docs.outdated directory.
  - [x] Move findings file to `docs.outdated/`.
  - [x] Commit the movement of the findings file.
- [x] Delete the findings file from `docs.outdated/`.
  - [x] Delete the findings file.
  - [x] Commit the deletion.
