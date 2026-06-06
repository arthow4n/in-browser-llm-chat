---
name: code-review-to-tasks
description: Performs code review, generates findings/planned fix, breaks down findings to implementation tasks, and reviews the implementation tasks.
---

# Code Review to Tasks Skill

Use this skill to perform a code review, generate a findings and planned fix file, break down the findings into a detailed implementation tasks checklist, and review the resulting tasks.

## Workflow Steps

1. **Perform Code Review**:
   - Invoke a subagent to apply the [code-review](../code-review/SKILL.md) skill to review the code or workspace.
   - The subagent must output the results to a findings and planned fix file in `docs/` (e.g., `docs/code-review-findings-<date>.md`) and commit this file.

2. **Break Down and Review Tasks**:
   - Invoke a subagent to apply the [findings-to-tasks](../findings-to-tasks/SKILL.md) skill to the findings and planned fix file.
