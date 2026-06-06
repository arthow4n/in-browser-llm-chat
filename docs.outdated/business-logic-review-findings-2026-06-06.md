# Business Logic Review Findings - 2026-06-06

## Summary

The application is reported as "basically unusable," specifically regarding the inability to chat or access settings. The review identifies a critical architectural flaw in how the core state machine is managed, leading to complete state desynchronization between the application root and the chat interface.

## Findings

### 1. Critical: Multiple `parentCoordinatorMachine` Instances

The `parentCoordinatorMachine` is designed as the global coordinator for the entire application, managing `ViewState` (navigation, onboarding, settings) and `ExecutionState` (LLM graph execution). However, it is instantiated multiple times using `useMachine` in different components:

- `src/App.tsx`
- `src/ui/chat/ChatInterface.tsx`

**Impact:**

- **State Desynchronization:** When `App.tsx` receives a `ROUTE_CHANGED` event from the URL, it updates its own local instance of the machine. The instance in `ChatInterface.tsx` remains unaware of this change.
- **Blocked Chatting:** Because the `ChatInterface`'s machine instance never receives the `ROUTE_CHANGED` event, its `context.currentThreadId` remains `null`. In `src/ui/chat/ChatInputArea.tsx`, the `handleSend` function explicitly checks for `currentThreadId` and returns early (logging "No active thread selected") if it is missing. This makes it impossible to send messages.
- **Broken View Transitions:** Transitions in `ViewState` (e.g., moving to `chatting` or `onboarding`) only occur in the instance that receives the event, leaving other components in the wrong state.

### 2. Missing Global Settings Trigger

The `parentCoordinatorMachine` defines a `globalSettings` state and an `OPEN_SETTINGS` event to access the global configuration (API keys, themes, etc.). However, there is no UI element in the application that triggers this event.

- `src/App.tsx` contains an empty `<HeaderGlobalBar>`, where such a trigger was intended to be placed.

**Impact:**

- Users cannot access the Global Settings to configure API keys, which is a prerequisite for the app to function (otherwise it enters the `onboarding` state).

### 3. Inconsistent State Access

The `ChatInterface` attempts to load thread data independently via `useEffect` and `getThread` / `getMessagesForThread` calls, updating a separate `chatInterfaceDisplayMachine`. While this handles the visual data, the actual "brain" of the operation (`parentCoordinatorMachine`) is not in sync with this data.

## Planned Fixes

### 1. Implement a Global State Provider for `parentCoordinatorMachine`

Move the instantiation of `parentCoordinatorMachine` from individual components into a React Context Provider.

- Create a `CoordinatorProvider` component that initializes the machine once and provides the `state` and `send` function to the entire component tree via a custom hook (e.g., `useCoordinator`).
- Update `App.tsx` and `ChatInterface.tsx` to use `useCoordinator()` instead of `useMachine(parentCoordinatorMachine)`.

### 2. Add Global Settings Button

Implement a "Settings" button in the `HeaderGlobalBar` of `App.tsx` that sends the `OPEN_SETTINGS` event to the global coordinator machine.

### 3. Ensure Proper View State Integration

Ensure that when `ViewState` transitions to `globalSettings`, `presetConfig`, or `workflowConfig`, the appropriate UI overlays or routes are rendered. Currently, `App.tsx` only renders `Routes`, and the machine state is not being used to conditionally render these settings views at the root level.

## Verification Plan

- [ ] Verify that `currentThreadId` is consistent across `App.tsx` and `ChatInterface.tsx` after a route change.
- [ ] Confirm that messages can be sent successfully in `ChatInputArea` when a thread is active.
- [ ] Verify that clicking the new Global Settings button correctly transitions the `ViewState` to `globalSettings` and displays the settings UI.
- [ ] Test the onboarding flow: verify that users are correctly routed to `onboarding` when API keys are missing and can then enter `globalSettings` to fix it.
