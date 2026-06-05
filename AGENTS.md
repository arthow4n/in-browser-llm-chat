# Guide for coding agents

## Git/GitHub conventions

- Unless otherwise instructed, commit the changes directly after you are done with the work, but don't push.
- Begin the commit message and pull request title with the coding agent name.
  - Bad example
    - Add X and do Y
  - Good examples
    - (Antigravity) Add X and do Y
    - (Jules) Add X and do Y

## One-off scripts and inline script evaluation

Prefer writing TypeScript and run with `npx tsx`.

If you need to run any one-off script, write it under this projects `tmp/` then run it.

If you need to run any form or evaluation (including but not limited), write it as one-off script then run the script.

Remove the one-off scripts at the end of session e.g. before you commit the changes.

These rules are to ensure you you'll be approved to run the commands.

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

## Code Architecture & Conventions

- **NO Default Exports**: Use only named exports and imports. `export default` is explicitly banned as it causes refactoring issues and confusion (exception: configuration files that strictly require it like `vite.config.ts`).
- **NO Barrel Files**: Do not use `index.ts` or `index.tsx` files to re-export modules. They lead to circular dependencies and bloated imports. Explicitly import from the specific file.
- **File Naming**: Do not name files `index.ts` or `index.tsx`. Name them descriptively based on their contents.
