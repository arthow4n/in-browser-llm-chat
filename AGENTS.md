# Guide for coding agents

## Git/GitHub conventions

- Unless otherwise instructed, commit the changes directly but don't push.
- Begin the commit message and pull request title with the coding agent name.
  - Bad example
    - Add X and do Y
  - Good examples
    - (Antigravity) Add X and do Y
    - (Jules) Add X and do Y

## Toolchains

### Commands

Use the following commands to run the project's quality checks and builds:

- **Formatting (apply)**: `npm run format`
- **Type-check**: `npm run typecheck`
- **Lint (check and apply autofix)**: `npm run lint:fix`
- **Tests**: `npm run test`
- **Build**: `npm run build`

### Rules for using commands

- If you are only editing documents, just run formatting, don't run lint/test/build.
- At the beginning of session, don't run tests/build/lint etc, you'll be guaranteed that the workspace is clean.

## UI State Machine Policy

- The UI state for every single detail, including all interactive controls, buttons, form fields, loading states, error states, and transitions, must be fully driven by XState state machines. No local component state or external state management outside of the specified state machines should be used for interactive states.

## UI Aesthetics Policy

- Use ONLY the Carbon Design System.
- Do NOT use "premium design aesthetics" like glassmorphism, custom micro-animations, or custom typography (like Inter/Outfit). Adhere strictly to the Carbon Design System defaults and tokens.
