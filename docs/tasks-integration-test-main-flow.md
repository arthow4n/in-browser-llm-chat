# Implementation Tasks: Main User Flow Integration Test

## Original Query

plan for implementing an integration test that will really check the main business logic e.g. can a new user just setup and chat with LLM normally from scratch, currently it seems like such a test is missing, it might be expected that the test will fail at the beginning, but its important that we plan a thought-thorough test to reflect the business logic, also investigate the current code shape to understand if theres anything thats potentially missing, but the main test case should be reflecting the simple integrated user flow, focus on just making 1 main user flow test for now.

---

## Rules for the Coding Agent

1. **Strict Sequential Execution**: Execute the tasks in the exact order listed. Do not skip ahead.
2. **Worktree Verification**: After completing the logic for each step, you MUST verify the project state by running:
   - `npm run format`
   - `npm run typecheck`
   - `npm run lint:fix`
   - `npm run test`
   - `npm run build`
3. **Code Review**: Perform a self-review or use a subagent to ensure the implementation is correct, follows project conventions, and doesn't introduce regressions.
4. **Commit Convention**: Commit the changes for each step individually following the guidelines in `AGENTS.md`.
5. **No Default Exports**: Ensure all new files use named exports.
6. **No Barrel Files**: Do not create or use `index.ts` for re-exporting.

---

## 1. Infrastructure Setup

### Step 1.1: Configure `fake-indexeddb`

Configure the test environment to use `fake-indexeddb` to simulate a clean browser environment for integration tests.

- [x] Ensure `fake-indexeddb` is installed as a dev dependency.
- [x] Create or update the Vitest setup file (e.g., `src/tests/setup.ts`) to import and initialize `fake-indexeddb` before tests run.
- [x] Verify that `IndexedDB` is available in the test environment.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 1.2: Implement MSW Handlers for LLM Providers

Create Mock Service Worker (MSW) handlers to intercept and mock responses from Google Gemini and OpenRouter APIs.

- [x] Initialize MSW in the test setup.
- [x] Implement a handler for the Google Gemini API endpoint (`generativelanguage.googleapis.com`) that returns a valid, LangChain-compatible chat response.
- [x] Implement a handler for the OpenRouter API endpoint (`openrouter.ai`) that returns a valid, LangChain-compatible chat response.
- [x] Ensure the mocks can be customized per test (e.g., simulating errors or different response content).
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 1.3: Implement Database Cleanup Utility

Create a helper utility to clear all IndexedDB tables between integration tests to ensure test isolation.

- [x] Implement a `clearDatabase()` function that deletes all records from `settings`, `presets`, `threads`, `messages`, and `checkpoints` tables.
- [x] Integrate `clearDatabase()` into the `beforeEach` hook of the integration test suite.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

## 2. Onboarding & Seeding Test

### Step 2.1: Test API Key Storage

Implement a test case to verify that API keys are correctly saved using the `globalSettings` logic.

- [x] Create `src/tests/integration/main-user-flow.test.ts`.
- [x] Implement logic to trigger the `saveSettings` action via the `globalSettingsMachine` with a set of mock API keys.
- [x] Query the IndexedDB `settings` table and assert that the API keys are stored correctly.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 2.2: Verify Default Preset Seeding

Verify that the initial seeding of default presets occurs as expected during the onboarding/settings process.

- [x] Implement logic to trigger the seeding process (if it's not already triggered by `saveSettings`).
- [x] Query the IndexedDB `presets` table and assert that the expected default presets (as defined in `globalSettings.ts`) are present.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

## 3. Full Execution Loop

### Step 3.1: Implement Thread Creation Logic

Implement a test step that programmatically creates a new chat thread.

- [x] Implement logic to create a new thread in the DB associated with the `builtin-standard-workflow` and one of the seeded presets.
- [x] Assert that the thread is correctly persisted in the `threads` table with the correct workflow and preset IDs.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 3.2: Implement `graphRunnerActor` Execution Trigger

Implement the instantiation of the `graphRunnerActor` and the dispatch of the initial message.

- [x] Spawn the `graphRunnerActor` using the newly created thread ID.
- [x] Send a `START` event to the actor with a user message (e.g., "Hello, who are you?").
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 3.3: Implement Execution Synchronization

Implement a robust mechanism to wait for the asynchronous LangGraph execution to complete.

- [x] Implement a mechanism to wait for the `graphRunnerActor` to reach a terminal state (e.g., `idle` or `completed`).
- [x] Use `await` with a promise-based approach or `waitFor` from Testing Library to monitor state transitions and `emit` events, ensuring the test doesn't proceed until the execution is finished.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 3.4: Verify Final Database State

Assert that the conversation and the execution state were correctly persisted.

- [x] Query the `messages` table and assert that both the `user` message and the `assistant` message (from the MSW mock) are present and correctly linked to the thread.
- [x] Query the `checkpoints` table and assert that the LangGraph checkpoint for the final state was persisted.
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

## 4. Failure Analysis & Refinement

### Step 4.1: Initial Execution & Gap Analysis

Run the complete integration test and identify any implementation gaps or bugs.

- [x] Run the integration test suite.
- [x] Document any failures, unexpected state transitions, or missing error handling identified during the run.
- [x] Analyze if the failures are due to the test setup or actual bugs in the business logic (e.g., `graphRunnerActor`, DB schema, or compiler).
- [x] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [x] Perform code review.
- [x] Commit the changes.

### Step 4.2: Fixes and Refinements

Address the identified issues and refine the test assertions.

- [ ] Implement fixes for any bugs discovered in Step 4.1.
- [ ] Refine test assertions to be more robust (e.g., adding better `waitFor` logic or more specific DB checks).
- [ ] Ensure the full "Happy Path" integration test passes consistently.
- [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
- [ ] Perform code review.
- [ ] Commit the changes.

---

## 5. Cleanup

- [ ] Move the findings file to the docs.outdated directory.
  - [ ] Move findings file to `docs.outdated/`.
  - [ ] Commit the movement of the findings file.
- [ ] Delete the findings file from `docs.outdated/`.
  - [ ] Delete the findings file.
  - [ ] Commit the deletion.
