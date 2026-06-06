---
name: business-logic-review-to-tasks
description: Performs business logic review, generates findings/planned fix, breaks down findings to implementation tasks, and reviews the implementation tasks.
---

# Business Logic Review to Tasks Skill

Use this skill to perform a business logic review, generate a findings and planned fix file, break down the findings into a detailed implementation tasks checklist, and review the resulting tasks.

## Workflow Steps

1. **Perform Business Logic Review**:
   - Invoke a subagent to apply the [business-logic-review](../business-logic-review/SKILL.md) skill to review the code and documentation.
   - The subagent must output the results to a findings and planned fix file in `docs/` (e.g., `docs/business-logic-review-findings-<date>.md`) and commit this file.

2. **Break Down and Review Tasks**:
   - Invoke a subagent to apply the [findings-to-tasks](../findings-to-tasks/SKILL.md) skill to the findings and planned fix file.
