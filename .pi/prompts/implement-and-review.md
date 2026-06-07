---
description: Worker implements, reviewer reviews, worker applies feedback
---

Use the subagent tool with the chain parameter to execute this workflow:

The original request is:
<request>
$@
</request>

To begin with, identify the task (without rephrasing) and the parameters to this workflow.

The parameters are:
- Task: the actual task in the request, without rephrasing.
- Loops: how many times should (2->3) loop. Default to 3 if not specified. The user might phrase it like "Loop 5 times" in the request.

Then, execute the below as a subagent chain 1->(2->3)*X, where X is the loop count from parameter, the passing output between steps via {previous}.

1. First, use the "worker" agent to implement the task then commit all the chagnes.
2. Then, use the "reviewer" agent, it should be given the original task context so it can review the implementation from the previous step. (use {previous} placeholder)
3. Then, use the "worker" agent to apply the feedback from the review then commit all the changes. (use {previous} placeholder)



