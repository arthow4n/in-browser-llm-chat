# Integration Test Findings

## Test Suite: `src/test/integration/main-user-flow.test.ts`

### Failure: `should trigger execution of the graphRunnerActor for a new thread`

**Error:**

```
AssertionError: expected [ { …(9) } ] to have a length of 2 but got 1
- Expected
+ Received
- 2
+ 1
 ❯ src/test/integration/main-user-flow.test.ts:205:22
```

**Description:**
The test expects that after the `graphRunnerActor` has completed its execution for a new thread, there should be two messages in the database: the initial user message and the assistant's response. However, only one message (the user message) was found.

**Preliminary Analysis:**

- The initial user message is correctly created and stored in the database via `createNewThread`.
- The `graphRunnerActor` is spawned and receives the `START` event.
- The actor reaches a terminal state, which suggests the `fromPromise` invocation in the `requesting` state completed.
- The assistant message is not present in the database, indicating that either:
  1. The LangGraph execution did not trigger the LLM call.
  2. The LLM call was made, but the resulting assistant message was not correctly saved to the database.
  3. The LangGraph execution finished prematurely without reaching the assistant response stage.

**Potential areas to investigate:**

- `graphRunnerActor.ts`: The logic inside `requesting` state, specifically how `compiled.stream` is called and how messages are collected and saved from the stream.
- `compiler.ts`: How the workflow is compiled and if the state initialization with existing messages is working as expected.
- `db/db.ts`: The `saveMessage` and `getMessagesForThread` functions.
- The `callLLM` implementation within `graphRunnerActor.ts` to ensure it properly emits/returns the response.
