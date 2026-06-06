# Guide for coding agents

## Git/GitHub conventions

- Unless otherwise instructed, commit the changes directly after you are done with the work, but don't push.
- Subagents should work on the same branch as the current one unless otherwise mentioned. Do not create a new worktree or branch when creating a subagent.
- Begin the commit message and pull request title with the coding agent name. If the model selection or model ID is available (especially for Antigravity), include it in the agent name prefix (e.g., `(Antigravity/Gemini 3.5 Flash (Low))` or `(Antigravity/gemini-3.5-flash)` should be prioritized over `(Antigravity)`). However, the model name/id shouldn't be "guessed" - it must be explicitly provided in the prompt. If it is not explicitly provided, it is better to omit the model name/id in the commit message.
  - Bad example
    - Add X and do Y
  - Good examples
    - (Antigravity/Gemini 3.5 Flash (Low)) Add X and do Y
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

## Tech Stack

- **Frontend Framework**: React ^19.2.6
- **State Management**: XState ^5.32.0
- **UI Framework**: Carbon Design System ^1.108.0
- **Routing**: React Router ^7.16.0
- **Build Tool**: Vite ^8.0.14
- **LLM Orchestration**: LangChain Core ^1.1.48, LangGraph ^1.3.2
- **LLM SDKs**: Google GenAI ^2.7.0, OpenRouter SDK ^0.12.79
- **Testing**: Vitest ^4.1.7, MSW ^2.14.6, Testing Library ^16.3.2
- **Linting/Formatting**: Oxlint ^1.67.0, Oxfmt ^0.52.0
- **Validation**: Zod ^4.4.3

## UI State Machine Policy

- The UI state for every single detail, including all interactive controls, buttons, form fields, loading states, error states, and transitions, must be fully driven by XState state machines. No local component state or external state management outside of the specified state machines should be used for interactive states.

## UI Aesthetics Policy

- Use ONLY the Carbon Design System.
- Do NOT use "premium design aesthetics" like glassmorphism, custom micro-animations, or custom typography (like Inter/Outfit). Adhere strictly to the Carbon Design System defaults and tokens.

## Code Architecture & Conventions

- **NO Default Exports**: Use only named exports and imports. `export default` is explicitly banned as it causes refactoring issues and confusion (exception: configuration files that strictly require it like `vite.config.ts`).
- **NO Barrel Files**: Do not use `index.ts` or `index.tsx` files to re-export modules. They lead to circular dependencies and bloated imports. Explicitly import from the specific file.
- **File Naming**: Do not name files `index.ts` or `index.tsx`. Name them descriptively based on their contents.
