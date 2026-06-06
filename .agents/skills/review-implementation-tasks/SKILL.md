---
name: review-implementation-tasks
description: Shouldn't be invoked unless explicitly requested by the user. Dispatches a subagent to review the broken down implementation tasks against the original plan for coherence.
---

Repeat the task below for X times (X is 2 unless otherwise specified by user), this is to get individual reviews and fixes, don't do things yourself, jump directly into dispatching subagent and don't think yourself, don't mention to the subagent about iteration.

<task>
Dispatch an isolated subagent to critically review the actual broken down tasks (e.g., `docs/implementation-tasks.md`) against the original plan (e.g., `docs/scratchpad.md`). The subagent should ensure that the plan and the tasks are coherent and there are no missing or disconnected steps.
The subagent should then try based on the review to improve the tasks file, fixing any missing steps, logical gaps, or ambiguous descriptions. 
Then git commit the changes where the commit message is the gist of changes, then finally the subagent exits.

Here are some example review focus areas for the subagent:

- Ensure no details from the plan were lost during the breakdown.
- Ensure the steps are small, sequential, and follow a logical order.
- Ensure the tasks don't bundle too many complex requirements into a single step.

The subagent should only use edit tools when making edits, not terminal commands.
</task>
