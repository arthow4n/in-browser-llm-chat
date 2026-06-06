---
description: Scout gathers context, planner creates implementation plan (no implementation)
---

Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder). The planner must include the original user query "$@" at the top of the plan file for context. The planner must write the plan to a file in `docs/` with a descriptive name (e.g., `docs/plan-something.md`) and return the path to the file.

Execute this as a chain, passing output between steps via {previous}. Do NOT implement - just return the path to the plan file.
