---
name: business-logic-review-to-tasks
description: Performs business logic review, generates findings/planned fix, breaks down findings to implementation tasks, and reviews the implementation tasks.
---

# Business Logic Review to Tasks Skill

Use this skill to perform a business logic review, generate a findings and planned fix file, break down the findings into a detailed implementation tasks checklist, and review the resulting tasks.

## Workflow Steps

1. **Perform Business Logic Review**:
   - Invoke a subagent to apply the [business-logic-review](../business-logic-review/SKILL.md) skill to review the code and documentation.
   - The subagent must output the results to a findings and planned fix file in `docs/` (e.g., `docs/business-logic-review-findings-<date>.md`).

2. **Break Down Plan into Tasks**:
   - Invoke a subagent to apply the [breakdown-plan](../breakdown-plan/SKILL.md) skill to the findings and planned fix file.
   - The subagent must generate a detailed, sequential, and actionable implementation checklist.
   - **Crucial Requirement**: The generated implementation checklist MUST include the following tasks at the very end of the file as the final steps:
     - [ ] Move the findings file (e.g., `docs/business-logic-review-findings-<date>.md`) to the [docs.outdated](../../docs.outdated) directory.
       - [ ] Move findings file to `docs.outdated/`.
       - [ ] Commit the movement of the findings file.
     - [ ] Delete the findings file from `docs.outdated/`.
       - [ ] Delete the findings file.
       - [ ] Commit the deletion.

3. **Review Implementation Tasks**:
   - Invoke a subagent to apply the [review-implementation-tasks](../review-implementation-tasks/SKILL.md) skill to verify and refine the generated implementation tasks file.
