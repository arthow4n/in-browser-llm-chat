---
name: business-logic-review
description: Business logic review skill to ensure the implementation is coherent with the scratchpad and that the scratchpad accurately reflects the actual business logic.
---

# Business Logic Review Skill

Use this skill to review the business logic of the application and ensure it is perfectly synchronized with the project documentation (specifically `docs/scratchpad.md`).

The main point of the review is to:

- **Scratchpad Alignment**: Ensure that the actual implementation of the business logic (including state machines, data flows, and domain rules) matches what is described in the scratchpad.
- **Undocumented Logic Discovery**: Identify any business logic, edge cases, or state transitions implemented in the code that are missing from the scratchpad. This includes:
  - State machines or machine states/events not documented in the scratchpad.
  - Complex conditional logic or business rules that are not reflected in the documentation.
  - API interactions or data transformations that deviate from the documented flow.
- **Consistency & Coherence**:
  - Check for logical contradictions between the code and the documentation.
  - Identify ambiguities in the scratchpad that could lead to incorrect implementation.
  - Ensure that the "source of truth" (the scratchpad) is updated to reflect the actual, working implementation if the implementation is correct but the documentation is outdated.
- **UI State Machine Policy**: Verify that all interactive UI states are driven by XState as defined in the UI State Machine Policy. If new states or transitions were added to the code but not the scratchpad, flag this as a documentation gap.
- **Logical Soundness**: Review the business logic for potential flaws, race conditions, or missing edge cases that should be both implemented and documented.

The goal is to ensure that any developer or agent reading the scratchpad has a complete and accurate understanding of how the application's business logic actually works.
