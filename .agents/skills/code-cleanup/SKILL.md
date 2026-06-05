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
