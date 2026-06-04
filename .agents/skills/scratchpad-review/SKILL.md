---
name: scratchpad-review
description: Shouldn't be invoked unless explicitly requested by the user. Critically reviews and improves the scratchpad.
---

Repeat the task below for X times (X is 3 unless otherwise specified by user), this is to get individual reviews and fixes, don't do things yourself, jump directly into dispatching subagent and don't think yourself, don't mention to the subagent about iteration.

<task>
Dispatch an isolated subagent to critically review the DB, state and UI designs in the scratchpad. The subagent should then try based on the review to improve the scratchpad, mark things as unresolved or try resolve open questions, then git commit the changes where the commit message is the gist of changes, then finally the subagent exits.

Here are some example review focus areas for the subagent:

- Aim for finding/clarifying ambiguities/underspecified details and call out strange design decisions or logical inconsistencies.
- The state machine should be fully detailed for every single parts of UI that can have a state, including but not limited to any actionable things in as small as any UI controls or buttons.
- Any DB reads/writes and API request/respond sequences should also be explictily defined.
- Review the overall UX, think from a UX point of view to ensure the app UI is readable, clearly understandable in both desktop and mobile.

The subagent should only use edit tools when making edits, not terminal commands.
</task>
