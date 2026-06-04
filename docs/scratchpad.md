# Scratchpad

This a scratchpad for writing down vague ideas for building this LLM chat app for personal use. The goal is to provide a clear specification so that the coding agent can later build the app with minimal human intervention while still aligning with the user's vision.

This file will be collaboratively updated by the human user and the coding agent, by default the coding agent should ask open questions before editing this scratchpad as per the [Open questions](#open-questions) section, don't jump into editing the other parts of this scratchpad directly.

## Tech stack

- Deployed to GitHub Pages as static client side-only application. Build pipeline may use Node scripts/dependencies.
- LangGraph.js `@langchain/langgraph/web` for LLM agent orchestraion in-browser.
- React frontend.
- XState and `@xstate/react`, all the application and UI states should be fully driven by state machine(s).
- Carbon Design System `@carbon/react` as is without custom design/styling overrides (no custom glassmorphism, HSL custom palettes, or custom animations). Support switching between dark and light mode, defaulting to the same as system settings. Auto-detect and sync with system color scheme by default. Provide a selector in the header/settings to manually override it to "Light" (Carbon `g10` / `white`) or "Dark" (Carbon `g100` / `g90`), saving this preference as a global setting in IndexedDB.
- TypeScript: Install package `@typescript/native-preview` instead of package `typescript`.
- Lint: `oxlint-tsgolint@latest` instead of ESLint
  - Turn on type awared linting https://oxc.rs/docs/guide/usage/linter/type-aware.html
  - Turn on React and Vitest plugin https://oxc.rs/docs/guide/usage/linter/plugins.html
- Formatting: `oxfmt` instead of Prettier.
- Zod v4 for parsing/validating data.
- Vite for bundling.
- Vitest for tests. "Write tests. Not too many. Mostly integration."
- No E2E test.
- Persistance with IndexedDB via `idb` (and `fake-indexeddb` in test) instead of localStorage/sessionStorage. This is to ensure the storage has higher quota.
- Markdown & Math Rendering: `react-markdown`, `rehype-katex`, `remark-gfm`, and `remark-math` for rendering markdown messages and LaTeX equations.
- Support using OpenRouter and Gemini API as LLM API provider, and potentially switching to another provider in the future.
  - Prefer using the official `@openrouter/sdk` and `@google/genai` client libraries within custom LangGraph nodes to execute direct browser API calls rather than a custom fetch wrapper, while retaining full control over streaming and reasoning configurations.
  - API keys are stored in IndexedDB in plain text.
  - Direct API calls are made from the browser. CORS is handled by OpenRouter and Gemini API.
- `AGENTS.md` should be kept up-to-date to run the tool chains e.g. formatting, typecheck, lint with autofix, test, build.

Fill in anything missing.

## Global Layout and Navigation

- A left sidebar (Carbon `SideNav`) for navigation containing:
  - Top header with app branding, a manual Light/Dark mode theme toggle, and a hamburger icon button.
  - A scrollable list of chat threads (with "New Chat" and "Branch" indicators).
  - Quick-link tabs or accordion sections for switching the main content area (Chat, Workflows CRUD, Presets CRUD, Settings).
  - **Mobile Adaptation:** On mobile viewports (< 672px), the sidebar collapses completely. Tapping the header's hamburger icon slides the navigation menu over the content as an overlay panel (with a maximum width of 280px to leave a tap-to-close backdrop area). Tapping any option or clicking the overlay background auto-collapses it.

## Features and use cases to support

"Be yet another poweruser LLM chat app" so the LLM chat UI basics and some features need to be there, plus:

- The user is always chatting with an workflow (an orchestration graph with 0-many LLM agents) directly instead of a single agent.
  - The normal chat feature for chatting to one single LLM agent like in an average LLM chat app still works, just that behind the scene it should go through the same code path as if chatting with an orchestration with many LLM agents.
  - The default selected workflow when creating a new chat is still the good old workflow where there's only 1 human user and 1 agent with a system prompt like "you are an helpful assistant".
  - The UI should also support running orchestration workflow without an user input (but still requires the user to manuall approve to start such a workflow).
- Workflow management CRUD
  - Workflow = agent orchestration graph like for LangGraph
    - Built-in workflow can be anything LangGraph supported.
    - User-defined workflow needs to be able to be serialised to/deserialised from persistance.
    - The editing interface for custom workflows is a text-based JSON editor; no graphical/visual editor is required. On mobile, this remains a simple `TextArea` with word-wrap and horizontal/vertical scrolling, relying entirely on the native mobile keyboard (no helper keyboard bar or custom virtual buttons). The JSON is edited via a basic `TextArea` that only validates the schema when the user clicks "Save", displaying validation errors in a modal dialog.
    - Here is where the user can define which are the agents involved in an orchestration and their system prompts.
  - Node execution sequence and underlying LLM threads should be visible in the chat feed, rendered as flatly as possible so they look like working within one single thread, including reasoning tokens.
  - To begin with, there should be a built-in debate workflow, where the user should be able to seed the debate with a topic, then let 2 agents debate infinitely in a loop until they come to consensus, the agents come to consensus by making tool call to suggest leaving the debate loop, then finally another agent summarise the debate for the user to review.
- LLM provider preset management CRUD
  - Presets are managed in a dedicated, persistent Settings page/sidebar tab.
  - Preset = combination of LLM API provider, API key, LLM model, and configs like reasoning/thinking level, API retry policy, budget policy (e.g. force asking for human approval after X steps in the workflow without human user sending an message).
  - When opening a new chat thread, the thread selects the default preset as the initial preset. The selected preset ID is saved per thread in the database.
  - When switching back to an old thread: if the saved preset is still available, it is used; otherwise, it falls back to the default preset.
  - **Onboarding and First-Time User Experience:** If no presets or keys are found in IndexedDB on load, load the workspace normally but show a persistent, clickable warning banner at the top of the page ("No API keys configured. Click here to configure settings.") and disable the chat input field until a preset is set up.
- Thread management CRUD
  - Current thread ID is sync with URL so refreshing should lead to the same thread
- System message management CRUD for automatically inserting system message to agents upon API request, but these automatically inserted messages shouldn't be persisted in the chat history.
  - Provide a global UI list in settings for system messages that apply to all workflows (ignoring the preset/workflow details for now).
  - Should suport insertion depth (similar to SillyTavern, should be able to specify to attach system message at the Nth message from the beginning/end of the chat messages thread)
- Render agent and user messages with rich markdown formatting, GitHub Flavored Markdown (e.g. tables, checkboxes), and LaTeX math support (both inline and block equations) using the specified rendering packages.
- Render reasoning tokens (collapsed by default). Both reasoning tokens and text content are streamed in real-time. The "Reasoning Process" accordion must remain collapsed by default during streaming and after response completion. Use a fallback renderer or debounced updates to handle malformed partial markdown or math blocks during generation.
- Render tool call message and tool result message (collapsed by default)
  - There should be a built-in "ask_questions" tool which LLM can invoke to render a specific UI along with the tool call message, which the user can use to answer questions by mostly clicking instead of always having to type manually. The tool accepts an array of questions, and for each question an array of suggested answers for multi-select. Next to the suggested answers, there's a freetext input field which the user can use to enter freetext answer or leave an optional comment next to the answer they selected. The user should also be able to chooe to refuse answer a certain question or all the questions, when refusing, the user can leave an optional comment to explain the refusal.
  - There should be a set of built-in tools for creating and updating user-defined workflows, so the user can chat with the LLM agent to create another workflow interactively. Any database-modifying tools (such as creating/updating a workflow) require explicit user confirmation. The tool call is rendered as a "Proposed Action" card showing a diff or description, and execution pauses until the user clicks "Approve" or "Deny". Other standard, read-only tools (like `ask_questions`) execute automatically.
- Manual history edit:
  - Each message includes a small, low-profile options button (three-dots icon) with a minimum 44x44px target. This button is permanently visible (with a light opacity like 0.6) on both desktop and mobile viewports. There should be no hover-only requirements; this no-hover, permanently visible approach is globally applied for all UI elements. Clicking/tapping it opens a menu (or slide-up bottom sheet on mobile) containing "Edit", "Delete", and "Branch Thread" options. This avoids tap-interception issues on the message bubble itself, allowing normal text selection and link clicks. Clicking "Edit" transforms the message bubble inline into a text area to save edits.
  - Remove/delete a message in the middle of history via the same message options menu.
  - Message Insertion (Prefill): Add a small role selector dropdown button next to the main chat text input (defaulting to "User"). Changing it allows selecting "Assistant" or "System", letting the user type a message and press Send to insert it directly as that role at the end of history.
- API Payload Preview: Add a "Preview API Payload" button in the active chat header. Clicking it opens a Modal showing the exact JSON structure of messages (including the injected system messages) that would be sent to the LLM API next. Injected messages are highlighted with a distinct background/border and marked with an `[INJECTED]` badge to assist debugging.

## Technical Architecture Proposals

### 1. Database Schema (IndexedDB)

We propose using the following stores in the `in-browser-llm-chat-db` database:

- **`settings`**: For global configs (API keys stored in plain text, active theme, default presets).
  - Key: `key` (string, e.g., `"api_keys"`, `"ui_config"`)
  - Value: `{ value: any }`
- **`presets`**: LLM configurations.
  - Key: `id` (UUID)
  - Fields: `name`, `provider` (`"openrouter" | "gemini"`), `model` (string), `apiKey` (if not global), `temperature`, `maxTokens`, `reasoningLevel`, `budgetPolicy` (`{ maxStepsWithoutUser: number }`)
- **`workflows`**: Serialized LangGraph definitions.
  - Key: `id` (string/UUID)
  - Fields: `name`, `description`, `isBuiltIn` (boolean), `nodes` (Array of node definitions), `edges` (Array of transition definitions)
- **`threads`**: Chat sessions.
  - Key: `id` (UUID)
  - Fields: `title`, `workflowId`, `activePresetId`, `createdAt`, `updatedAt`, `parentThreadId` (null or parent UUID for branched threads)
- **`messages`**: Individual messages in threads.
  - Key: `id` (UUID)
  - Fields: `threadId`, `role` (`"system" | "user" | "assistant" | "tool"`), `content`, `type` (`"text" | "reasoning" | "tool_call" | "tool_result"`), `toolCallId` (optional), `name` (agent/tool name), `createdAt`, `metadata` (reasoning tokens, raw response, etc.)

### 2. Custom Workflow JSON Serialization

To allow serializing graphs in IndexedDB, we define a declarative schema that is compiled into a LangGraph graph at runtime. There is no limit to the topology size or complexity, allowing users to define any custom workflow just as if they were hand-coding it:

```typescript
interface WorkflowNode {
  id: string; // unique within graph
  type: "agent" | "input" | "tool" | "consensus_check" | "summary";
  name: string;
  systemPrompt?: string;
  presetId?: string; // inherits default if empty
  tools?: string[]; // e.g. ["ask_questions"]
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: {
    type: "on_tool_call" | "on_tool_result" | "on_consensus" | "on_no_consensus";
    targetNode: string;
  };
}
```

During runtime, a factory function converts this JSON schema into a compiled `@langchain/langgraph` `StateGraph`.

### 3. XState Application States

A single high-level state machine will coordinate the application:

- `idle`: Ready for user actions (switching thread, editing preset, starting chat).
- `configuringPreset`: Editing LLM presets.
- `configuringWorkflow`: Customizing or creating workflows.
- `chatting`: Active thread view, waiting for user input.
- `graphExecuting`: Running LangGraph steps in-browser.
- `awaitingHumanInput`: Graph execution paused (either via manual approval requirement or `ask_questions` tool popup).
- `error`: Failed API requests or execution exceptions.

### 4. `ask_questions` Tool Schema & Flow

The `ask_questions` tool is defined as:

- **Input Parameters (Zod)**:
  ```typescript
  const AskQuestionsSchema = z.object({
    questions: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        options: z.array(z.string()), // suggested multi-select options
        allowFreetext: z.boolean().default(true),
      }),
    ),
  });
  ```
- **Flow**:
  1. The LLM agent invokes `ask_questions` with specific questions.
  2. The LangGraph runner intercepts the tool call and pauses execution (using LangGraph interrupts).
  3. The UI detects the pending interrupt and renders a premium inline card form directly in the chat feed with checkboxes, freetext comment fields, and a "Refuse to answer" button with optional reasoning. Multiple tool calls per agent turn can be rendered as multiple inline cards. Once answered/refused, form inputs become disabled/read-only to preserve the history.
  4. Once submitted, the user's answers are formatted as a `tool` role message and execution resumes.

### 5. Debate Workflow Execution Details

- **Nodes**:
  - `Initiator`: Sets the debate topic and seeds the conversation.
  - `Debater_A` & `Debater_B`: Two agent nodes with conflicting stances or system messages (e.g., Pro vs. Con).
  - `Consensus_Evaluator`: Checks if consensus is reached or if maximum loops are exceeded. If yes, routes to `Summarizer`; if no, loops back to the next debater.
- **Safety / Cost Control & Loop Controls**:
  - Max loop limit (default: 5 rounds of debate / 10 turns) to prevent infinite loops and runaway API costs.
  - The debaters themselves must call a `declare_consensus` tool when they agree, which terminates the loop.
  - The workflow configuration must support forcing a minimum of X rounds of loop before the `declare_consensus` tool is given to the debaters (X can be set to 0 to disable this forced loop).
  - General Loop Control Panel: Any workflow with loops (including the debate workflow) should render a control card in the UI showing the current round, number of turns, and estimated cost, with buttons to Pause, Resume, or Force Consensus / Summarize early. On mobile viewports, the panel collapses into a compact, sticky bottom bar (or overlay) showing the round count and estimated cost, where a single tap opens a full-screen control overlay detailing all stats and controls.

### 6. System Message Injection Details

- System messages to automatically inject are configured per workflow or globally.
- **Insertion Depth**:
  - Depth `0`: Prepend to the very beginning of the messages list.
  - Depth `N` (positive): Insert after the N-th message.
  - Depth `-N` (negative): Insert N messages from the end of the history.
- When sending context to the LLM API, these messages are inserted on-the-fly but are **never** persisted to the IndexedDB `messages` store for that thread. They are invisible in the main chat feed, and can only be viewed/previewed within a "Preview API Payload" overlay or in the workflow settings panel.

## Open questions

### Process of handling open questions

When updating this file with open questions, please only add to the current open questions list below.

Each distinct decision or sub-question must be structured as its own separate `#### Question: <title>` section with its own suggested options and response placeholder. Do not group multiple distinct questions or decisions under a single question header, as this makes it difficult to respond to them one by one.

Always use the following format:

```md
#### Question: <short title of question here>

<Description of the question and the suggested options>

##### Response

[UNRESOLVED]
```

The human user will replace the `[UNRESOLVED]` tag with their response. The human user will then prompt the coding agent to incorporate the responses into this scratchpad file, and remove those already incorporated open questions, along with any questions that are no longer relevant.

### Current open questions:

#### Question: Loop Control Card Placement

For workflows containing loops (such as the Debate workflow), where should the Loop Control Panel be positioned in the UI?

_Suggested Options:_

- **Option A (Recommended):** Rendered as a sticky control bar at the top of the chat area on desktop. On mobile, it collapses into a compact floating action button (FAB) or thin top status bar to save vertical space; tapping it opens a modal overlay with the detailed turn counters and control actions.
- **Option B:** Rendered inline as a special card directly in the chat feed (moving up as new messages are added).
- **Option C:** Placed as a floating card in a corner of the chat viewport.

##### Response

[UNRESOLVED]

#### Question: Loop Cost Estimation Details

For workflows containing loops (such as the Debate workflow), how should "estimated cost" be calculated and displayed to the user?

_Suggested Options:_

- **Option A (Recommended):** Display a simple counter of steps/turns and a running count of estimated input/output tokens (without currency calculation).
- **Option B:** Use a hardcoded price-per-token map for Gemini/OpenRouter models to display estimated costs in USD.
- **Option C:** Only display step/turn counter and execution duration.

##### Response

[UNRESOLVED]

#### Question: Chat Feed message styling for reasoning and tool tokens

How should reasoning tokens, tool calls, and tool results be styled in the chat feed?

_Suggested Options:_

- **Option A (Recommended):** Use Carbon `<Accordion>` components.
  - _Reasoning:_ Collapsed by default under "Reasoning Process" inside the assistant's message. To prevent page overflow, the content is capped at `max-height: 250px` with vertical scrollbars.
  - _Tool Calls/Results:_ Collapsed by default under "Tool: [Name]". Expanding shows a formatted JSON/arguments block.
  - _Scroll Anchoring:_ Expanding accordions preserves chat scroll anchoring so the user does not lose their viewing position.
- **Option B:** Display reasoning inline but with a lighter font color/smaller size and a toggle button to hide it. Show tool calls/results in a smaller font size as code blocks, not collapsible.

##### Response

[UNRESOLVED]

#### Question: Input Blocking for `ask_questions` Tool Interrupts

When the `ask_questions` tool interrupts execution to ask for human input, should it disable the main chat message input box?

_Suggested Options:_

- **Option A (Recommended):** Yes, block/disable the main chat input field while the workflow is waiting for the tool answers, since typing a normal chat message would violate the graph execution state. All form controls are sized with a minimum of 44x44px touch targets.
- **Option B:** No, allow the user to type a normal message, which automatically "refuses" the tool questions and sends the typed text as the refusal reason.

##### Response

[UNRESOLVED]

#### Question: Answering Completeness for `ask_questions` Tool Interrupts

When the `ask_questions` tool interrupts execution, must the user answer all questions in the card, or can they submit answers to a subset and leave others blank?

_Suggested Options:_

- **Option A (Recommended):** The user can fill out any subset, click checkboxes for multi-select, and submit. Any unanswered questions are treated as skipped. If the user clicks "Refuse to Answer", it clears answers and submits a refusal payload with their optional comment.
- **Option B:** The user must either answer all questions or explicitly click "Refuse to Answer".

##### Response

[UNRESOLVED]

#### Question: Oxlint Type-Aware Linting Configuration

Oxlint type-aware linting (`oxlint-tsgolint`) requires pointing the linter to a `tsconfig.json` to resolve types. How should we configure the `lint` and `lint:fix` commands in `package.json`?

_Suggested Options:_

- **Option A (Recommended):** Update the npm scripts to:
  - `"lint": "oxlint --tsconfig tsconfig.json --react-plugin --vitest-plugin"`
  - `"lint:fix": "oxlint --tsconfig tsconfig.json --react-plugin --vitest-plugin --fix"`
    This ensures that both CLI runs and developer commands benefit from type-aware rules (like checking for unawaited promises).
- **Option B:** Keep the standard fast lint command as is, and add a separate `"lint:type-aware"` script for deep checks before committing/building.

##### Response

[UNRESOLVED]
