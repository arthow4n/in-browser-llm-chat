---
name: findings-to-tasks
description: Breaks down a findings and planned fix file into a detailed implementation tasks checklist and reviews the resulting tasks.
---

# Findings to Tasks Skill

Use this skill to take a findings and planned fix file and transform it into a reviewed implementation tasks checklist.

## Workflow Steps

1. **Break Down Plan into Tasks**:
   - Invoke a subagent to apply the [breakdown-plan](../breakdown-plan/SKILL.md) skill to the findings and planned fix file.
   - The subagent must generate a detailed, sequential, and actionable implementation checklist.
   - **Crucial Requirement**: The generated implementation checklist MUST include the following tasks at the very end of the file as the final steps:
     - [ ] Move the findings file to the [docs.outdated](../../docs.outdated) directory.
       - [ ] Move findings file to `docs.outdated/`.
       - [ ] Commit the movement of the findings file.
     - [ ] Delete the findings file from `docs.outdated/`.
       - [ ] Delete the findings file.
       - [ ] Commit the deletion.

2. **Review Implementation Tasks**:
   - Invoke a subagent to apply the [review-implementation-tasks](../review-implementation-tasks/SKILL.md) skill to verify and refine the generated implementation tasks file.
