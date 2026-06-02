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

Use the following commands to run the project's quality checks and builds:

- **Formatting (check)**: `npm run format:check`
- **Formatting (apply)**: `npm run format`
- **Type-check**: `npm run typecheck`
- **Lint (check)**: `npm run lint`
- **Lint (apply autofix)**: `npm run lint:fix`
- **Tests**: `npm run test`
- **Build**: `npm run build`
