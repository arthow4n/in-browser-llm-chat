---
name: code-cleanup
description: Does typescript cleaning tasks like refactoring to get rid of `as any` and unnecessary `as unknown as`.
---

# Code Cleanup Skill

Use this skill to clean up the TypeScript code.
Your task is to refactor the code to remove bypasses such as:
- `as any`
- Unnecessary `as unknown as`
- Any other temporary type bypasses

Make sure the expectations are clear:
- The types must be coherent and logically correct.
- Ensure you don't introduce new runtime bugs while cleaning up the types.

### Key Practices & Learnings for Cleanup:
1. **Prefer Explicit Imports**: Many type bypasses or `unknown` usages can be avoided by explicitly exporting and importing the exact types (e.g., `Thread`, `GraphStateType`) from the source files. Default to using the real type definitions whenever possible. Structural type casting (`as { specificKey: string }`) is also a code smell and should be avoided in favor of proper type imports or native library methods.
2. **Vitest Mock Types**: `vi.fn()` without type arguments violates the `vitest(require-mock-type-parameters)` rule. Avoid `vi.fn<any>()` as it violates `no-explicit-any`. Instead, use accurate signatures like `vi.fn<typeof importedFunction>()` or `vi.fn<(...args: [string]) => Promise<unknown>>()`.
3. **Complex Third-Party Generics**: For highly complex library generics (like LangGraph's `StateGraph`), attempt to supply the exact intended generics. If it is impossible without hacking the library types, use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on the specific line as a documented exception rather than a silent `as any` cast.
4. **XState Testing**: When testing state machine snapshots, DO NOT use structural type casting (e.g. `(snapshot.value as { ViewState?: string }).ViewState === "idle"`). This is a code smell. Instead, use the native `.matches()` API: `snapshot.matches({ ViewState: "idle" })`.
