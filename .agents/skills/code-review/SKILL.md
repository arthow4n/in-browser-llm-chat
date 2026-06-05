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
- Verify the code strictly adheres to the current step being done and the overall plan in the scratchpad.
