---
name: code-review
description: Code review skill to ensure code is coherent, logically correct, and lacks bypasses.
---

# Code Review Skill

Use this skill to review the code of a specific implementation step.
The main point of the review is to:

- Ensure the code is coherent and logically correct.
- Ensure that there are no bypasses (such as `as any` or `as unknown as`) which will later need to be cleaned up by the `code-cleanup` skill.
- Point out any such bypasses so the implementing agent can fix them before committing.
- **Strict Typing Checks**:
  - Ensure real types are explicitly imported and used rather than relying on `unknown` or `any`. Avoid structural type casting (`as { specificKey: string }`) as it is a code smell.
  - Check that Vitest mocks are properly typed (e.g., `vi.fn<typeof func>()`) to satisfy `require-mock-type-parameters` without triggering `no-explicit-any`.
  - For XState snapshots or complex types, verify that native APIs (like `snapshot.matches()`) are used instead of type casting `snapshot.value`.
- **No-Mocking Policy**: Flag any use of `vi.mock()` for internal modules (e.g. database modules, internal functions, stores) as a violation. The only permitted mocking is at the network/API layer using `msw`. Tests must use real implementations (e.g. `fake-indexeddb` for IndexedDB) rather than mocked abstractions. Point out any such violations so the implementing agent can refactor the test to an integration-style test.
- **UI State Machine Policy**: Verify that the application state, including everything in the UI (interactive controls, buttons, form fields, loading states, error states, and transitions), is 100% driven by XState state machines as defined in the UI State Machine Policy. No local component state (e.g. `useState`) or external state management should be used for interactive states.
- Verify the code strictly adheres to the current step being done and the overall plan in the scratchpad (`docs/scratchpad.md`).
- Ensure there are no lint, type, test, or build errors. The reviewer must double check by running the corresponding commands (formatting, typecheck, lint, test, build). All those commands must be executed, and any errors (including lint warnings) must be reported as must be fixed.
