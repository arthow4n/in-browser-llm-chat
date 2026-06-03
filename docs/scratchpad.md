# Scratchpad

This a scratchpad for writing down vague ideas for building this LLM chat app for personal use. The goal is to provide a clear specification so that the coding agent can later build the app with minimal human intervention while still aligning with the user's vision.

This file will be collaboratively updated by the human user and the coding agent, by default the coding agent should ask open questions before editing this scratchpad as per the [Open questions](#open-questions) section, don't jump into editing the other parts of this scratchpad directly.

## Tech stack

- Deployed to GitHub Pages as static client side-only application. Build pipeline may use Node scripts/dependencies.
- LangGraph.js `@langchain/langgraph/web` for LLM agent orchestraion in-browser.
- React frontend.
- XState and `@xstate/react`, all the application and UI states should be fully driven by state machine(s).
- Carbon Design System `@carbon/react` as is without custom design/styling overrides (no custom glassmorphism, HSL custom palettes, or custom animations). Support switching between dark and light mode, defaulting to the same as system settings.
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
- Support using OpenRouter and Gemini API as LLM API provider, and potentially switching to another provider in the future.
  - API keys are stored in IndexedDB in plain text.
  - Direct API calls are made from the browser. CORS is handled by OpenRouter and Gemini API.
- `AGENTS.md` should be kept up-to-date to run the tool chains e.g. formatting, typecheck, lint with autofix, test, build.

Fill in anything missing.

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
    - The editing interface for custom workflows is a text-based JSON editor; no graphical/visual editor is required.
    - Here is where the user can define which are the agents involved in an orchestration and their system prompts.
  - Node execution sequence and underlying LLM threads should be visible in the chat feed, rendered as flatly as possible so they look like working within one single thread, including reasoning tokens.
  - To begin with, there should be a built-in debate workflow, where the user should be able to seed the debate with a topic, then let 2 agents debate infinitely in a loop until they come to consensus, the agents come to consensus by making tool call to suggest leaving the debate loop, then finally another agent summarise the debate for the user to review.
- LLM provider preset management CRUD
  - Presets are managed in a dedicated, persistent Settings page/sidebar tab.
  - Preset = combination of LLM API provider, API key, LLM model, and configs like reasoning/thinking level, API retry policy, budget policy (e.g. force asking for human approval after X steps in the workflow without human user sending an message).
  - When opening a new chat thread, the thread selects the default preset as the initial preset. The selected preset ID is saved per thread in the database.
  - When switching back to an old thread: if the saved preset is still available, it is used; otherwise, it falls back to the default preset.
- Thread management CRUD
  - Current thread ID is sync with URL so refreshing should lead to the same thread
- System message management CRUD for automatically inserting system message to agents upon API request, but these automatically inserted messages shouldn't be persisted in the chat history.
  - Should suport insertion depth (similar to SillyTavern, should be able to specify to attach system message at the Nth message from the beginning/end of the chat messages thread)
- Render reasoning tokens (collapsed by default)
- Render tool call message and tool result message (collapsed by default)
  - There should be a built-in "ask_questions" tool which LLM can invoke to render a specific UI along with the tool call message, which the user can use to answer questions by mostly clicking instead of always having to type manually. The tool accepts an array of questions, and for each question an array of suggested answers for multi-select. Next to the suggested answers, there's a freetext input field which the user can use to enter freetext answer or leave an optional comment next to the answer they selected. The user should also be able to chooe to refuse answer a certain question or all the questions, when refusing, the user can leave an optional comment to explain the refusal.
  - There should be a set of built-in tools for creating and updating user-defined workflows, so the user can chat with the LLM agent to create another workflow interactively.
- Manual history edit
  - Edit a message in the middle of history
  - Remove a message in the middle of history
  - Manually insert a message to the end of history as any roles (e.g. for assistant prefill)
- Branching from a certain message in the chat thread: Hovering over a message shows a "Branch" button. Clicking it clones/duplicates the thread up until that message, creating a new thread, updating the URL, and listing it in the sidebar.

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
  - General Loop Control Panel: Any workflow with loops (including the debate workflow) should render a control card in the UI showing the current round, number of turns, and estimated cost, with buttons to Pause, Resume, or Force Consensus / Summarize early.

### 6. System Message Injection Details

- System messages to automatically inject are configured per workflow or globally.
- **Insertion Depth**:
  - Depth `0`: Prepend to the very beginning of the messages list.
  - Depth `N` (positive): Insert after the N-th message.
  - Depth `-N` (negative): Insert N messages from the end of the history.
- When sending context to the LLM API, these messages are inserted on-the-fly but are **never** persisted to the IndexedDB `messages` store for that thread. They are invisible in the main chat feed, and can only be viewed/previewed within a "Preview API Payload" overlay or in the workflow settings panel.

## Open questions

### Process of handling open questsions

When updating this file with open questions, please only add to the current open questions list below in the following format:

```md
#### Question: <short title of question here>

<Description of the question, considerations made, and suggested answers/options for it, etc. This part is mostly free-form>

##### Response

[UNRESOLVED]
```

so the human user knows which questions are still open, the human user will then replace the UNRESOLVED tag with their response. Then the human user will prompt the coding agent to incorparate the responses into this scratchpad file, and remove those already incorparated open questions, and the questions that are no longer relevant.

### Current open questions:

#### Question: Global Layout and View Navigation (including Mobile Behavior)

How should the main user interface be structured to navigate between chat threads, custom workflows, LLM presets, and global settings on both desktop and mobile viewports?

_Suggested Options:_

- **Option A (Recommended):** A left sidebar (Carbon `SideNav`) for navigation containing:
  - Top header with app branding, a manual Light/Dark mode theme toggle, and a hamburger icon button.
  - A scrollable list of chat threads (with "New Chat" and "Branch" indicators).
  - Quick-link tabs or accordion sections for switching the main content area (Chat, Workflows CRUD, Presets CRUD, Settings).
  - **Mobile Adaptation:** On mobile viewports (< 672px), the sidebar collapses completely. Tapping the header's hamburger icon slides the navigation menu over the content as an overlay panel (with a maximum width of 280px to leave a tap-to-close backdrop area). Tapping any option or clicking the overlay background auto-collapses it.
- **Option B:** A top navigation bar (Header tabs) for switching major views. On mobile, this bar wraps or collapses into a dropdown select menu. Chat threads are listed in a collapsible sidebar drawer.
- **Option C:** A persistent minimal sidebar on desktop. On mobile, the interface uses a bottom navigation tab bar (similar to a native mobile app) for switching views, with chat threads accessible via a slide-right drawer.

##### Response

[UNRESOLVED]

#### Question: Custom Workflow JSON Editor UI & Validation

Since custom workflows are edited via a text-based JSON editor, how should JSON formatting and validation errors be displayed to the user?

_Suggested Options:_

- **Option A (Recommended):** A `TextArea` displaying the JSON content, paired with real-time validation using Zod. Validation is debounced by 500ms after the user stops typing to prevent constant flashing. When invalid, it displays a compact error helper text under the text area and disables the "Save Workflow" button.
- **Option B:** A basic `TextArea` that only validates schema when the user clicks "Save", displaying validation errors in a modal dialog.
- **Option C:** Provide a split screen: the JSON editor on the left and a live-updating interactive/read-only list of parsed nodes and edges on the right to visually verify the structure.

##### Response

[UNRESOLVED]

#### Question: General Loop Control Panel UI & Cost Estimation

For workflows containing loops (such as the Debate workflow), where should the Loop Control Panel be positioned, and how should "estimated cost" be calculated?

_Suggested Options:_

- **Loop Control Card Placement:**
  - **Option A (Recommended):** Rendered as a sticky control bar at the top of the chat area on desktop. On mobile, it collapses into a compact floating action button (FAB) or thin top status bar to save vertical space; tapping it opens a modal overlay with the detailed turn counters and control actions.
  - **Option B:** Rendered inline as a special card directly in the chat feed (moving up as new messages are added).
  - **Option C:** Placed as a floating card in a corner of the chat viewport.
- **Cost Estimation Details:**
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

#### Question: Interaction Flow for `ask_questions` Tool Interrupts

When the `ask_questions` tool interrupts execution to ask for human input:

1. Should it disable the main chat message input box?
2. Must the user answer all questions in the card, or can they submit answers to a subset and leave others blank?

_Suggested Options:_

- **Input blocking:**
  - **Option A (Recommended):** Yes, block/disable the main chat input field while the workflow is waiting for the tool answers, since typing a normal chat message would violate the graph execution state. All form controls are sized with a minimum of 44x44px touch targets.
  - **Option B:** No, allow the user to type a normal message, which automatically "refuses" the tool questions and sends the typed text as the refusal reason.
- **Answering completeness:**
  - **Option A (Recommended):** The user can fill out any subset, click checkboxes for multi-select, and submit. Any unanswered questions are treated as skipped. If the user clicks "Refuse to Answer", it clears answers and submits a refusal payload with their optional comment.
  - **Option B:** The user must either answer all questions or explicitly click "Refuse to Answer".

##### Response

[UNRESOLVED]

#### Question: History Edit & Message Insertion UI

How should users trigger edits/deletions of existing messages, and how should they insert messages at the end of the history?

_Suggested Options:_

- **Editing / Deleting:**
  - **Option A (Recommended):** Hovering over a message in the feed reveals an action toolbar with "Edit", "Delete", and "Branch" buttons. On mobile/touch viewports, tapping a message opens a bottom sheet drawer containing these options. Clicking "Edit" transforms that message's bubble into a text area with "Save" and "Cancel" buttons.
  - **Option B:** Double-clicking a message opens a modal dialog to edit/delete the message.
- **Message Insertion (Prefill):**
  - **Option A (Recommended):** Add a small role selector dropdown button next to the main chat text input (defaulting to "User"). Changing it allows selecting "Assistant" or "System", letting the user type a message and press Send to insert it directly as that role.
  - **Option B:** Provide a dedicated "Prefill" button above the chat input that inserts an editable message block at the end of the thread.

##### Response

[UNRESOLVED]

#### Question: System Message Injection Configuration & Payload Preview

How should users configure system message injection, and where should they trigger the "Preview API Payload" overlay?

_Suggested Options:_

- **Injection Configuration:**
  - **Option A (Recommended):** Add an "Injected System Messages" list configuration inside the Workflow JSON editor (so it is saved per workflow).
  - **Option B:** Provide a global UI list in settings for system messages that apply to all workflows.
- **API Payload Preview:**
  - **Option A (Recommended):** Add a "Preview API Payload" button in the active chat header. Clicking it opens a Modal showing the exact JSON structure of messages (including the injected system messages) that would be sent to the LLM API next. Injected messages are highlighted with a distinct background/border and marked with an `[INJECTED]` badge to assist debugging.
  - **Option B:** Show it as a collapsible drawer/panel on the right side of the chat view.

##### Response

[UNRESOLVED]

#### Question: Theme Switching Behavior

How should light/dark theme switching be handled?

_Suggested Options:_

- **Option A (Recommended):** Auto-detect and sync with system color scheme by default. Provide a selector in the header/settings to manually override it to "Light" (Carbon `g10` / `white`) or "Dark" (Carbon `g100` / `g90`).
- **Option B:** Auto-detect and sync with system color scheme only, with no manual override.
- **Option C:** Manual override only (defaults to Dark).

##### Response

[UNRESOLVED]

#### Question: Mobile Responsiveness and Touch Target Adaptations

Since this application must be fully usable on mobile browsers, how should we adapt complex desktop-centric interactions (such as hover menus, JSON editors, and dense control dashboards) for touch screens and smaller viewports?

_Suggested Options:_

- **Hover Actions (Edit / Delete / Branch) on Mobile:**
  - **Option A (Recommended):** On touch devices, instead of hover triggers, tapping a message reveals a slide-up bottom sheet or a modal menu listing the actions ("Branch Thread", "Edit Message", "Delete Message").
  - **Option B:** Render a permanent, low-profile row of action icons (Edit, Delete, Branch) under/next to each message card on mobile (opacity 0.6) so they are directly tappable without hover or extra clicks.
  - **Option C:** Use a long-press gesture to trigger a context menu over the selected message.
- **Text-based JSON Workflow Editor on Mobile:**
  - **Option A (Recommended):** Render the JSON editor as a full-screen-width text area with word-wrap enabled, and show a helper bar above the software keyboard containing quick-tap insertion buttons for structural characters (`{`, `}`, `[`, `]`, `"`, `:`).
  - **Option B:** Keep the simple `TextArea` but with horizontal and vertical scrolling, relying entirely on the native mobile keyboard.
- **Loop Control Card on Mobile:**
  - **Option A (Recommended):** Collapse the Loop Control Panel on small screens into a compact, sticky bottom bar (or overlay) displaying just the round count and estimated cost, with a single tap triggering a full-screen control overlay.
  - **Option B:** Keep the same layout as desktop but scaled down, which might require horizontal scrolling or very small font sizes.

##### Response

[UNRESOLVED]
