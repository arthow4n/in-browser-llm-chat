---
name: breakdown-plan
description: Shouldn't be invoked unless explicitly requested by the user. Converts a vague plan file into a highly detailed, concrete, actionable checklist for coding agents.
---

# Instructions

You are tasked with converting a project plan or scratchpad into a concrete, actionable implementation checklist.

1. **Output Location**: Create the output checklist file inside the `docs/` directory. The filename must be specific to the plan being broken down, rather than a generic name. For example, if the input is `docs/code-review-findings-20260606-01.md`, the output should be `docs/implementation-tasks-code-review-findings-20260606-01.md` or something similarly descriptive. DO NOT use generic names like `docs/implementation-tasks.md`.

2. **Detail Level Requirement**: The final detail level in the output task file must be highly detailed and actionable. If the input plan is vague, you must expand upon it and fill in the missing details so the coding agents have exact specifications for each step. The goal is to ensure the implementation steps are so clear that a "dumb coding agent" can execute them sequentially without ambiguity.

3. **Format and Structure**:
   - At the beginning of the file, clearly quote or state the original source of the plan (i.e. the user prompt) so that the coding agent understands the context.
   - Start the document with a set of "Rules for the Coding Agent" (e.g., strict sequential execution, verifying worktree state, code review, commit conventions).
   - Divide the implementation into major logical phases (e.g., `## 1. Project Scaffolding & Dependencies`).
   - Under each phase, define specific steps (e.g., `- [ ] **Step 1.1:** <Detailed description>`).
   - For every step, provide standard sub-checklists for the agent to check off, such as:
     - [ ] Implement the logic/feature.
     - [ ] Verify worktree state (`npm run format`, `npm run typecheck`, `npm run lint:fix`, `npm run test`, `npm run build`).
     - [ ] Perform code review (self/subagent).
     - [ ] Commit the changes following `AGENTS.md`.

4. **Example Reference**: Use the structure and detail level of `docs.outdated/implementation-tasks.md` as your gold standard. Your generated checklist should look very similar in structure to that file, but adapted to the specific plan you are converting.

5. **Step Granularity**: Do not lump too many features into a single step. Each step should be isolated enough that it can be implemented, tested, and committed independently.
