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
- Commit before implementation: run `git rev-parse HEAD` to identify, this is the <starting-commit>.

Then, execute the below as a subagent chain 1->(2->3)\*X, where X is the loop count from parameter, the passing output between steps via {previous}.

1. First, spawn a "worker" agent which will implement the task, then commit all the chagnes before exiting.
2. Then, spawn a "reviewer" agent which should be given the original task context, make it run `git diff <starting-commit> HEAD` then perform the review for the changes since the <starting-commit>, it should then output the review. (use {previous} placeholder)
3. Then, spawn a "worker" agent which will apply the feedback from the review, then commit all the changes before exiting. (use {previous} placeholder)
