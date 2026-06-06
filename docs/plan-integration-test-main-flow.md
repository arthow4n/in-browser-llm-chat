# Implementation Plan: Main User Flow Integration Test

## Goal
Implement a comprehensive integration test that verifies the primary business logic of the application: a new user setting up their API keys, creating a chat thread, and receiving a successful response from the LLM.

## Context & Analysis
Currently, the project has unit tests for individual components (like DB operations), but lacks a high-level integration test that exercises the full orchestration loop. 

The "Happy Path" involves several interconnected systems:
1. **Persistence Layer**: `IndexedDB` (via `fake-indexeddb` in tests) storing settings, presets, threads, and messages.
2. **Onboarding Logic**: `globalSettings` machine handling API key storage and initial preset seeding.
3. **Thread Management**: Selection of a workflow (from `builtInWorkflows`) and a preset.
4. **Execution Engine**: `graphRunnerActor` which:
    - Compiles a JSON workflow into a LangGraph `StateGraph`.
    - Executes the graph using the selected LLM SDK.
    - Streams and persists messages back to the database.
5. **External APIs**: LLM providers (Google GenAI / OpenRouter) which must be mocked to ensure deterministic tests.

## Proposed Solution

### Technical Design
The test will be implemented as a Vitest integration test. It will avoid the UI layer (React components) to focus on the **Business Logic** and **State Machines**, ensuring the core engine is robust before testing the UI glue.

#### Test Environment
- **Database**: Use `fake-indexeddb` to simulate a clean browser environment for every test run.
- **Network**: Use `MSW` (Mock Service Worker) to intercept LLM API calls. This allows us to verify that the correct API keys and payloads are sent and simulate various LLM responses.
- **State Orchestration**: Directly invoke XState machines (`globalSettingsMachine` and `graphRunnerActor`) using their `createActor` or `interpret` counterparts.

#### Test Flow Sequence
1. **Setup**:
    - Initialize `fake-indexeddb`.
    - Setup MSW handlers to return a successful chat completion for the expected LLM endpoint.
2. **Step 1: Onboarding**:
    - Trigger the `saveSettings` action in the `globalSettings` logic with a set of mock API keys.
    - **Verification**: Check the DB to ensure API keys are saved and that default presets have been seeded (as per `globalSettings.ts` logic).
3. **Step 2: Thread Initialization**:
    - Programmatically create a new thread in the DB associated with the `builtin-standard-workflow` and one of the seeded presets.
4. **Step 3: Execution**:
    - Spawn the `graphRunnerActor` with the newly created thread ID.
    - Send a `START` event with a user message (e.g., "Hello, who are you?").
    - Wait for the actor to reach a terminal state (e.g., `idle` or `completed`).
5. **Step 4: Final Verification**:
    - Query the `messages` table in the DB.
    - **Assertion**: Verify that there is a `user` message and a corresponding `assistant` message containing the mocked response from MSW.
    - **Assertion**: Verify that the LangGraph checkpoint was persisted in the DB.

### Specific Changes

#### New Test File
- Create `src/tests/integration/main-user-flow.test.ts`.

#### Mocking Requirements
- Implement MSW handlers for:
    - Google Gemini API (`generativelanguage.googleapis.com`).
    - OpenRouter API (`openrouter.ai`).
- Ensure the mocks return the expected LangChain/LangGraph compatible response format.

#### State Machine Integration
- The test will interact with the `graphRunnerActor` by monitoring its state transitions and `emit` events to know when the execution is complete.

## Implementation Strategy

### Phase 1: Infrastructure Setup
- [ ] Configure `fake-indexeddb` in the test setup file.
- [ ] Create MSW handlers for the LLM providers used in the "Standard Agent" workflow.
- [ ] Implement a helper utility to clear the database between tests.

### Phase 2: Onboarding & Seeding Test
- [ ] Implement the test logic to save API keys via the settings logic.
- [ ] Verify that the seeding of default presets occurs correctly in the DB.

### Phase 3: Full Execution Loop
- [ ] Implement thread creation logic.
- [ ] Implement `graphRunnerActor` orchestration:
    - Input: Thread ID + User Message.
    - Execution: Wait for state transition to completion.
- [ ] Verify the final state of the database (Messages and Checkpoints).

### Phase 4: Failure Analysis & Refinement
- [ ] Run the test and identify gaps in the current implementation (e.g., missing error handling in `graphRunnerActor`, DB schema mismatches, or compiler bugs).
- [ ] Fix identified issues and refine the test assertions.

## Constraints & Risks

### Potential Pitfalls
- **Async Timing**: LangGraph execution and IndexedDB writes are asynchronous. The test must use `await` and potentially `waitFor` from Testing Library or custom polling to avoid race conditions.
- **LLM SDK Versions**: The internal implementation of `GoogleGenAI` or `OpenRouter SDK` might change, requiring updates to MSW mocks.
- **State Machine Complexity**: `graphRunnerActor` has complex nested states (`running.requesting`). The test must correctly track these transitions.

### Trade-offs
- **Logic vs UI**: This plan focuses on the "Headless" integration (Business Logic $\rightarrow$ DB $\rightarrow$ API). While it doesn't test Carbon UI components, it tests 100% of the logic those components rely on. This is more stable and faster for CI.
