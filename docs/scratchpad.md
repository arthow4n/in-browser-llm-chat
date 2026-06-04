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
- Lint: `oxlint-tsgolint@latest` instead of ESLint.
  - Turn on type-aware linting and react/vitest plugins inside `.oxlintrc.json`.
  - The `package.json` scripts should simply call `oxlint` and `oxlint --fix` without command-line parameter overrides.
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

## Features and use cases to support

"Be yet another poweruser LLM chat app" so the LLM chat UI basics and some features need to be there, plus:

- The user is always chatting with a workflow (an orchestration graph with 0-many LLM agents) directly instead of a single agent.
  - The normal chat feature for chatting to one single LLM agent like in an average LLM chat app still works, just that behind the scene it should go through the same code path as if chatting with an orchestration with many LLM agents.
  - The default selected workflow when creating a new chat is still the good old workflow where there's only 1 human user and 1 agent with a system prompt like "you are an helpful assistant".
  - The UI should also support running orchestration workflow without an user input (but still requires the user to manuall approve to start such a workflow).
- Workflow management CRUD:
  - Workflow = agent orchestration graph like for LangGraph
    - Built-in workflow can be anything LangGraph supported.
    - User-defined workflow needs to be able to be serialised to/deserialised from persistance.
    - The editing interface for custom workflows is a text-based JSON editor (no graphical/visual editor required). See the [Workflow Management CRUD View](#3-workflow-management-crud-view) section in the UI Specification for details.
    - Here is where the user can define which are the agents involved in an orchestration and their system prompts.
  - Node execution sequence and underlying LLM threads should be visible in the chat feed, rendered as flatly as possible so they look like working within one single thread, including reasoning tokens.
  - To begin with, there should be a built-in debate workflow, where the user should be able to seed the debate with a topic, then let 2 agents debate infinitely in a loop until they come to consensus, the agents come to consensus by making tool call to suggest leaving the debate loop, then finally another agent summarise the debate for the user to review.
- LLM provider preset management CRUD:
  - Preset = combination of LLM API provider, API key, LLM model, and configs like reasoning/thinking level, API retry policy, budget policy (e.g. force asking for human approval after X steps in the workflow without human user sending an message).
  - When opening a new chat thread, the thread selects the default preset as the initial preset. The selected preset ID is saved per thread in the database.
  - When switching back to an old thread: if the saved preset is still available, it is used; otherwise, it falls back to the default preset.
  - Onboarding and First-Time User Experience: Guides users on first load if no presets or API keys exist. See the [Global Settings View](#5-global-settings-view) in the UI Specification for warning banner details.
- Thread management CRUD
  - Current thread ID is sync with URL so refreshing should lead to the same thread
- System message management CRUD for automatically inserting system message to agents upon API request, but these automatically inserted messages shouldn't be persisted in the chat history.
  - Should support insertion depth (similar to SillyTavern, should be able to specify to attach system message at the Nth message from the beginning/end of the chat messages thread).
  - Configured via a global settings list. See the [Global Settings View](#5-global-settings-view) in the UI Specification for details.
- Render agent and user messages with rich markdown formatting, GitHub Flavored Markdown, and LaTeX math support using the specified rendering packages.
- Render reasoning tokens (collapsed by default).
- Render tool call message and tool result message (collapsed by default).
  - There should be a built-in "ask_questions" tool which LLM can invoke to render a specific form directly in the chat feed to let users answer questions with check-boxes and comments.
  - There should be built-in tools for creating/updating custom workflows interactively via LLM chat. Any database-modifying tools (like custom workflow creation) require explicit user confirmation via an inline approval card.
- Manual history edit and branching: Allow editing/deleting any message in history, inserting new messages with selectable roles (prefill), and branching threads.
- API Payload Preview: Allow inspecting the exact payload sent to the LLM API (including injected system messages).
- _Note_: See the [Main Chat Interface](#2-main-chat-interface) section in the UI Specification for the exact layout and component details for all the above elements.

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
  - Fields: `title`, `workflowId`, `activePresetId`, `createdAt`, `updatedAt`, `parentThreadId` (null or parent UUID for branched threads), `parentMessageId` (null or parent message UUID at which branching occurred), `status` (`"idle" | "executing" | "awaiting_input" | "error"`), `errorMessage` (null or string), `latestCheckpointId` (null or string), `latestCheckpointNs` (null or string)
  - _Branching Behavior_: When branching a thread, the messages from the parent thread up to and including the `parentMessageId` are copied (cloned) to the new thread in the `messages` store under the new thread's ID. Subsequent checkpoints are not copied; instead, the new thread compiles its initial state from the checkpoint associated with the `parentMessageId` (using the same checkpoint ID and namespace, but saved under the new thread's ID).
- **`messages`**: Individual messages in threads.
  - Key: `id` (UUID)
  - Fields: `threadId` (indexed for query performance), `role` (`"system" | "user" | "assistant" | "tool"`), `content`, `type` (`"text" | "reasoning" | "tool_call" | "tool_result"`), `toolCallId` (optional), `name` (agent/tool name), `createdAt`, `metadata` (reasoning tokens, raw response, etc.), `checkpointId` (null or string), `checkpointNs` (null or string)
- **`checkpoints`**: LangGraph checkpointer state to enable resuming active graph execution and supporting history rewinding/branching.
  - Key: `[threadId, checkpointNs, checkpointId]` (compound key)
  - Fields: LangGraph checkpoint state objects (checkpoint data, metadata, parent checkpoint ID).
- **`checkpoint_writes`**: Stores intermediate writes for LangGraph tasks.
  - Key: `[threadId, checkpointNs, checkpointId, taskId, idx]` (compound key)
  - Fields: `channel`, `value`

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
  loopHeader?: boolean; // designates a node where a new loop round starts
}

interface WorkflowEdge {
  from: string;
  to: string; // The destination node
  condition?: "on_tool_call" | "on_tool_result" | "on_consensus" | "on_no_consensus";
}

interface GraphState {
  messages: any[]; // message history reducer to append/update messages
  lastAgentId: string | null; // records the ID of the agent node executed last (resolves routing back after tool runs)
  consensusReached: boolean; // boolean flag populated by consensus_check nodes for conditional routing
  turnCount: number; // tracks total steps/messages in execution
  currentRound: number; // tracks active loop iterations
}
```

During runtime, a factory function converts this JSON schema into a compiled `@langchain/langgraph` `StateGraph`. The factory maps each `WorkflowNode` type to its concrete execution behavior:

- **`agent`**: Invokes the LLM specified by `presetId` (or the default preset) using the `systemPrompt`, passing the thread's message history. It binds the tools specified in the `tools` array.
- **`input`**: Execution is interrupted/paused, waiting for a user message (uses a LangGraph interrupt).
- **`tool`**: Executes tool calls returned by agent nodes (e.g. `ask_questions`, `declare_consensus`, or other custom database tools) and generates the corresponding `tool` messages.
- **`consensus_check`**: Runs an LLM node or rule-based evaluator to analyze the message history and determine if consensus is reached, routing the graph outcome to the next state based on the consensus evaluation.
- **`summary`**: Runs a specialized LLM node to summarize the chat history up to the current point.

#### Conditional Routing and Edge Compilation Rules

During graph compilation, the factory function maps conditional routes by creating custom router functions passed to `StateGraph.addConditionalEdges`:

- **Agent Routing**: If an `agent` node has tools, the graph needs to check if the agent produced a tool call. The compiled graph evaluates whether the state's last message is a tool call request. If yes, it routes along the edge with `condition: "on_tool_call"` (typically to a `tool` node). If no, it routes along the direct/unconditional edge (typically to a user input or another agent node). Note that `condition: "on_tool_result"` is only applicable to edges originating from `tool` nodes routing back to their parent agents.
- **Consensus Routing**: A `consensus_check` node returns a state flag (e.g. `consensusReached: boolean`). The routing function evaluates this flag: if `true`, it routes to the destination defined in the edge with `condition: "on_consensus"`; if `false`, it routes to the edge with `condition: "on_no_consensus"`.
- **Default Fallback**: If a node has multiple outbound edges and none of the specific conditions match the node execution outcome, the compiler uses the unconditional edge (i.e. where `condition` is omitted) as the default fallback target. If no fallback is defined, execution throws an error.

#### Custom Workflow Structural Validation Rules

Before a custom workflow is compiled or saved, the editor performs structural validation. The validation checks must verify:

1. **Connectivity**: Every node (except the initial input/entry node) must have at least one incoming path from the entry node, and there must be no completely isolated nodes.
2. **Edge Validity**: The `from` and `to` properties of every edge must reference existing node IDs in the `nodes` array.
3. **Graph Entry Point**: There must be exactly one entry point node (defined either as an `input` node or a node with no incoming edges). If multiple entry nodes or none are found, compilation fails.
4. **Loop Exit Paths**: Any loop/cycle in the graph must contain at least one conditional routing node (such as a `consensus_check` node or an `agent` node with tool capabilities) that can branch out of the loop, preventing compile-time or run-time infinite loop errors.

#### Dynamic Prompt Placeholders

To allow workflows to adapt to different user requests, system prompts in `WorkflowNode` definitions support dynamic placeholders (e.g. `{{user_input}}` or `{{topic}}`). The LangGraph runner compiles the workflow by replacing `{{user_input}}` with the content of the thread's first message, and `{{topic}}` with the debate topic or thread title. This enables creating re-usable, dynamic multi-agent workflows.

### 3. XState Application States

A single high-level state machine will coordinate the application using two parallel regions to decouple view/navigation from background graph execution:

- **`ViewState` (Navigation Region)**:
  - `initializing`: Reads config, API keys, presets, workflows, and active thread from IndexedDB.
  - `onboarding`: Blocker state active when no API keys are configured.
  - `idle`: Main screen active with no loaded thread.
  - `chatting`: Thread view active, showing message history and enabling input.
  - `presetConfig`: Active when modifying or creating an LLM preset.
  - `workflowConfig`: Active when modifying or creating workflows in the JSON editor.
  - `globalSettings`: Active when configuring API keys, themes, and injected system messages.
- **`ExecutionState` (Execution Region)**:
  - `inactive`: No active workflow execution.
  - `checkingStatus`: Asynchronously queries IndexedDB to resolve execution checkpoints and active background runner status on route/thread changes.
  - `executing`: Running `@langchain/langgraph/web` steps in the browser.
  - `awaitingHumanInput`: Paused/interrupted (e.g. for `ask_questions` tool input or database-modifying approvals).
  - `error`: Active when execution or API error occurs.

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
  - **Tool Exclusion Policy**: The workflow configuration must support forcing a minimum of X rounds of loop before the `declare_consensus` tool is given to the debaters (X can be set to 0 to disable this forced loop). During the first X rounds, the compiler excludes the `declare_consensus` tool from the tool bindings for the debater LLM calls, making the tool unavailable to them.
  - **General Loop Control Panel**: Any workflow with loops (including the debate workflow) should render a control card in the UI showing the current round, number of turns, and token usage, with buttons to Pause, Resume, or Force Consensus / Summarize early. On mobile viewports, the panel collapses into a compact, sticky bottom bar (or overlay) showing the round count and token statistics, where a single tap opens a full-screen control overlay detailing all stats and controls.
  - **Loop Round & Turn Tracking**: `turnCount` is defined as the total number of agent execution steps (nodes executed or messages generated) during the active run. `currentRound` tracks loop iterations and is incremented each time execution transitions back to a designated loop header node (e.g. `Debater_A` in the debate workflow). The workflow JSON schema supports designating a node as the `loopHeader` to identify where a round boundary is.
  - **Step-by-Step Execution and Pausing**: Pausing a loop is implemented using LangGraph's step-by-step streaming capability. The graph runner consumes the stream generator step-by-step. When "Pause" is clicked or the thread is switched, the runner stops pulling from the generator, aborts any active streaming LLM connection using an `AbortController` (to save costs and prevent orphaned calls), persists the current checkpoint, and transitions the state machine to `awaitingHumanInput` or `inactive`.
  - **Cost and Token Tracking Details**: Each LLM request response stores usage statistics (e.g., `prompt_tokens`, `completion_tokens`) inside the message's `metadata` field under `metadata.usage`. The LangGraph runner updates the `loopControl.tokenStats` context property in real-time by summing up the usage statistics from new messages generated during the current execution run, tracking both `promptTokens` and `completionTokens` separately.
  - **Streaming Buffer & Performance**: To prevent performance bottlenecks during real-time streaming, text tokens and reasoning tokens are buffered within the `graphRunnerActor`'s local state and sent to the parent machine's context via throttled events (e.g., every 100ms) for UI display. The cumulative stream content is only written to the IndexedDB `messages` store upon completion of the active node execution step, rather than on every individual token received. This prevents excessive database write transactions and UI re-renders.

### 6. System Message Injection Details

- System messages to automatically inject are configured per workflow or globally.
- **Insertion Depth**:
  - Depth `0`: Prepend to the very beginning of the messages list.
  - Depth `N` (positive): Insert after the N-th message.
  - Depth `-N` (negative): Insert N messages from the end of the history.
  - _Note_: If the active message history length is less than the calculated injection index, the insertion index is clamped to the range of valid indices: `Math.max(0, Math.min(messages.length, targetIndex))`.
- **Dynamic On-the-Fly Injection**: When sending context to the LLM API, these messages are injected dynamically immediately prior to calling the LLM within the agent node execution. They are **never** persisted to the IndexedDB `messages` store or stored in the LangGraph state/checkpoint history. This ensures that the message list in the checkpoint remains clean and matches the user's persisted database messages. Injected messages are invisible in the main chat feed, and can only be viewed/previewed within a "Preview API Payload" overlay or in the workflow settings panel.

## User Interface (UI) Specification

The application layout is built using the Carbon Design System (`@carbon/react`) out-of-the-box. There are no custom styling overrides (no custom glassmorphism, HSL custom palettes, or custom animations). The UI is structured into a persistent navigation layout with a primary content area that switches depending on the active view.

### 1. Global Navigation and Layout

- **Left Sidebar Navigation (Carbon `SideNav`)**:
  - **Header Area**: App branding, manual theme toggle selector (Light / Dark / Auto-sync with System), and a hamburger menu button.
  - **Thread List**: A scrollable list of chat threads, showing thread titles, active workflow/preset indicators, and a branch indicator if a thread was cloned.
  - **Quick Links / Accordion**: Dedicated tabs or accordion navigation options to switch the main content area between:
    - **Chat Interface** (Active Thread)
    - **Workflow Management**
    - **LLM Preset Settings**
    - **Global Settings**
  - **Mobile Adaptation**: On viewports `< 672px`, the sidebar collapses completely. Tapping the header's hamburger icon slides the sidebar in from the left as an overlay (max-width `280px` to leave a tap-to-close backdrop area). Tapping any menu item or the backdrop backdrop auto-collapses it.

### 2. Main Chat Interface

- **Chat Header**:
  - Displays the active thread's title.
  - Displays the active preset and active workflow.
  - **Preview API Payload Button**: Clicking it opens a Modal showing the exact JSON structure of messages (including injected system messages) that would be sent to the LLM API next. Injected messages are highlighted with a distinct background/border and marked with an `[INJECTED]` badge to assist debugging. Since a workflow may contain multiple agents, the modal includes a dropdown selector showing all agents in the current workflow (defaulting to the workflow's entry agent node if the thread is empty, or the next scheduled agent based on the graph's execution checkpoint) so the user can inspect the preview payload for any specific agent. For new or empty threads with no message history, the payload preview displays the initial system prompt configuration for the selected agent, combined with any active injected system messages. During active background execution, the preview button is disabled to prevent race conditions with running state updates.
- **Loop Control Panel (Sticky)**:
  - **Desktop**: Rendered as a sticky control bar at the top of the chat area.
  - **Mobile**: Collapses into a compact floating action button (FAB) or thin top status bar to save vertical space; tapping it opens a modal overlay with the detailed turn counters and control actions.
  - **Controls**: Displays the current loop round, turn count, and token usage (prompt and completion tokens tracked separately, without currency calculation). Contains buttons to Pause, Resume, or Force Consensus / Summarize early.
- **Chat Feed**:
  - **Message Bubbles**: Render user and assistant/agent messages with rich markdown formatting, GitHub Flavored Markdown (e.g. tables, checkboxes), and LaTeX math support (both inline and block equations).
  - **Message Options Menu**: Each message bubble includes a small, low-profile overflow button (three-dots icon) with a minimum `44x44px` target. This button is permanently visible (with a light opacity like `0.6`) on both desktop and mobile viewports (no hover-only requirements; this no-hover, permanently visible approach is globally applied for all UI elements). Clicking/tapping it opens a Carbon `OverflowMenu` (or a native Carbon `Modal` on mobile viewports for easier touch interaction) containing "Edit", "Delete", and "Branch Thread" options.
  - **Inline Message Editing**: Clicking "Edit" transforms the message bubble inline into a text area to save changes.
  - **Reasoning Process Accordion**: Collapsed by default under a "Reasoning Process" header inside the assistant's message. Capped at `max-height: 250px` with vertical scrollbars. Both reasoning tokens and text content are streamed in real-time. The accordion must remain collapsed by default during streaming and after response completion. Use a fallback renderer or debounced updates to handle malformed partial markdown or math blocks.
  - **Tool Call / Result Accordion**: Collapsed by default under a "Tool: [Name]" header. Expanding reveals a formatted JSON block of arguments or return outputs. Note: the `ask_questions` tool card form is rendered inline directly in the chat feed and must render/remain visible even when the tool call message itself is collapsed.
  - **Scroll Anchoring**: Expanding accordions preserves chat scroll anchoring so the user does not lose their viewing position.
  - **`ask_questions` Tool Card Form**: Rendered inline directly in the chat feed (using a Carbon `Tile` component to structure the form contents) when execution is interrupted. Sized with a minimum of `44x44px` touch targets. Includes checkboxes for multi-select, freetext comment fields, and a "Refuse to Answer" button. The user must either answer all questions in the card or explicitly click "Refuse to Answer" to submit the form. The form controls become read-only once submitted.
  - **Proposed Action Card**: Rendered inline for database-modifying tools (e.g., creating/updating a workflow). Shows a diff or description of the changes, with "Approve" or "Deny" buttons.
- **Chat Input Area**:
  - A main auto-resizing text input area.
  - **Role Selector Dropdown**: Next to the text input (defaulting to "User"), allowing the user to select "Assistant" or "System" to manually insert/prefill messages at the end of the history.
  - Send button.
  - **Input Blocking**: The main chat input field is blocked/disabled while the workflow is waiting for tool answers (e.g. from `ask_questions` interrupts) or manual approval, since typing a normal chat message would violate the graph execution state. All form controls are sized with a minimum of 44x44px touch targets.

### 3. Workflow Management CRUD View

- **Workflow List**: Scrollable list of built-in and user-defined workflows, each with active edit/delete buttons.
- **Workflow JSON Editor Pane**:
  - Text-based JSON editor containing a `TextArea` displaying the JSON content.
  - **Mobile**: Rendered as a simple `TextArea` with word-wrap and scrolling, relying on the native mobile keyboard (no helper keyboard bar or custom virtual buttons).
  - Validation: Performed when the user clicks "Save" (or dynamically as they type, debounced). If invalid, helper text describing the schema validation errors is displayed directly under the `TextArea`, and the "Save" button is disabled. No modal dialog validation interrupts should be used.

### 4. LLM Preset CRUD View

- **Preset List**: List of configured LLM presets with options to edit or delete.
- **Preset Configuration Panel**:
  - Fields for configuring Name, Provider (`"openrouter" | "gemini"`), Model ID (string), API Key (optional override), Temperature, Max Tokens, Reasoning/Thinking Level, and Budget Policy (e.g. max steps without user message).

### 5. Global Settings View

- **Global Config Form**:
  - **API Keys Section**: Password-masked input fields (masked by default with a show/hide toggle button) for OpenRouter and Gemini API keys (stored in IndexedDB).
  - **Theme Override Selector**: Selector for manually forcing Light/Dark mode.
  - **Injected System Messages Section**: Global UI list configuration for system messages that apply to all workflows.
- **Onboarding / Warning Banner**:
  - Displays a persistent, clickable warning banner at the very top of the workspace: `"No API keys configured. Click here to configure settings."`.
  - Disables the main chat input field until a preset/API key is successfully configured in Settings.

## State Machine Specification

The application state is managed by a central XState machine configured with parallel state regions. This design decouples UI view navigation from LangGraph background execution, allowing background workflows to run concurrently while the user navigates settings or configurations.

### State Transition Graph

```mermaid
stateDiagram-v2
    state ApplicationMachine {
        state ViewState {
            [*] --> initializing
            initializing --> onboarding : [No API Keys]
            initializing --> idle : [Has API Keys & No Active Thread]
            initializing --> chatting : [Has API Keys & Active Thread]

            onboarding --> globalSettings : OPEN_SETTINGS
            globalSettings --> onboarding : CLOSE_SETTINGS [Still No Keys]
            globalSettings --> idle : CLOSE_SETTINGS [Keys Configured, No Active Thread]
            globalSettings --> chatting : CLOSE_SETTINGS [Keys Configured, Active Thread]

            idle --> chatting : ROUTE_CHANGED [Thread Selected]
            idle --> presetConfig : OPEN_PRESET_EDIT
            idle --> workflowConfig : OPEN_WORKFLOW_EDIT
            idle --> globalSettings : OPEN_SETTINGS

            chatting --> idle : ROUTE_CHANGED [No Thread Selected]
            chatting --> chatting : ROUTE_CHANGED [Different Thread Selected]
            chatting --> presetConfig : OPEN_PRESET_EDIT
            chatting --> workflowConfig : OPEN_WORKFLOW_EDIT
            chatting --> globalSettings : OPEN_SETTINGS

            presetConfig --> chatting : CLOSE_PRESET_EDIT [If thread active]
            presetConfig --> idle : CLOSE_PRESET_EDIT [If no thread active]

            workflowConfig --> chatting : CLOSE_WORKFLOW_EDIT [If thread active]
            workflowConfig --> idle : CLOSE_WORKFLOW_EDIT [If no thread active]

            globalSettings --> chatting : CLOSE_SETTINGS [If thread active]
            globalSettings --> idle : CLOSE_SETTINGS [If no thread active]

            chatting --> onboarding : API_KEYS_REMOVED
            idle --> onboarding : API_KEYS_REMOVED
            presetConfig --> onboarding : API_KEYS_REMOVED
            workflowConfig --> onboarding : API_KEYS_REMOVED
        }
        --
        state ExecutionState {
            [*] --> inactive
            inactive --> executing : START_EXECUTION / SUBMIT_MESSAGE
            executing --> awaitingHumanInput : INTERRUPT / ASK_QUESTIONS_TRIGGER / PAUSE
            executing --> inactive : EXECUTION_COMPLETE
            executing --> error : EXECUTION_ERROR

            awaitingHumanInput --> executing : RESUME / SUBMIT_TOOL_RESPONSE / SUBMIT_APPROVAL
            awaitingHumanInput --> inactive : CANCEL_EXECUTION

            executing --> inactive : API_KEYS_REMOVED
            awaitingHumanInput --> inactive : API_KEYS_REMOVED

            error --> inactive : DISMISS_ERROR

            %% Route Change & Initial Checkpoint Loading
            inactive --> checkingStatus : ROUTE_CHANGED / INITIALIZE_CHECKPOINT
            executing --> checkingStatus : ROUTE_CHANGED [Pause current actor] / INITIALIZE_CHECKPOINT
            awaitingHumanInput --> checkingStatus : ROUTE_CHANGED / INITIALIZE_CHECKPOINT
            error --> checkingStatus : ROUTE_CHANGED / INITIALIZE_CHECKPOINT

            state checkingStatus {
                [*] --> queryingDB
                queryingDB --> resolveState : DB_RESULT
                queryingDB --> resolveError : DB_ERROR
            }
            checkingStatus --> inactive : RESOLVE_INACTIVE
            checkingStatus --> awaitingHumanInput : RESOLVE_INTERRUPTED
            checkingStatus --> executing : RESOLVE_RUNNING [If background execution is active]
            checkingStatus --> error : RESOLVE_ERROR
        }
    }
```

### 1. Machine Context (State Schema)

The state machine context maintains the following variables:

- `currentThreadId`: `string | null` - The ID of the currently selected chat thread (synced with the URL path).
- `activeWorkflowId`: `string | null` - The ID of the workflow loaded for the active thread.
- `activePresetId`: `string | null` - The ID of the LLM configuration preset selected for the active thread.
- `editingPresetId`: `string | null` - The ID of the preset currently being modified.
- `editingWorkflowId`: `string | null` - The ID of the custom workflow configuration currently being modified.
- `loopControl`:
  - `currentRound`: `number` - Current iteration count of the executing graph.
  - `turnCount`: `number` - Total messages or turns exchanged in the current run.
  - `tokenStats`: `{ promptTokens: number; completionTokens: number; totalTokens: number }` - Statistics tracking input and output tokens for the current execution.
- `errorMessage`: `string | null` - Details of the most recent execution or validation error.
- `apiKeysConfigured`: `boolean` - Indicates whether required API keys are available in IndexedDB.
- `graphRunnerActor`: `any` - A reference to the active spawned child actor managing LangGraph execution.

### 2. State Descriptions

#### ViewState (Navigation Region)

- **`initializing`**: Reads the configuration settings, API keys, presets, custom workflows, and active thread ID from the database.
- **`onboarding`**: A blocker state when API keys are not yet configured. The main chat input is disabled, prompting the user to click the warning banner to add API keys.
- **`idle`**: Ready for user interactions, with no thread loaded.
- **`chatting`**: Viewing an active thread. The main input is enabled and ready to accept user messages.
- **`presetConfig`**: Modifying or creating an LLM preset.
- **`workflowConfig`**: Modifying or creating custom workflows in the JSON `TextArea` editor.
- **`globalSettings`**: Modifying API keys, manual theme override, and injected system messages.

#### ExecutionState (Execution Region)

- **`inactive`**: No background workflow execution is running for the active thread.
- **`executing`**: Running `@langchain/langgraph/web` steps in the browser (input disabled).
- **`awaitingHumanInput`**: Graph execution is suspended (either due to a manual approval card or an `ask_questions` tool interrupt).
- **`error`**: Displays error information if an API request or state transition fails.

_Transition on Route Changes and Initialization_:
When a `ROUTE_CHANGED` or `INITIALIZE_CHECKPOINT` event is received, the `ExecutionState` transitions to the transient `checkingStatus` state. This handles both switching threads and completing onboarding/initial page load:

- The transient `checkingStatus` state invokes a promise actor to query IndexedDB asynchronously to load the selected thread's execution checkpoint and active background state.
- If the query succeeds with a `DB_RESULT`:
  - If the database indicates the thread has a pending interrupt or approval, the machine transitions to `awaitingHumanInput`.
  - If background execution is supported and the thread has active background execution running, it transitions to `executing` and resumes/spawns the runner actor.
  - Otherwise, it transitions to `inactive`.
- If the query fails with a `DB_ERROR`, the machine transitions to `error` via `RESOLVE_ERROR` and sets `errorMessage` in the context.
- To prevent resource runaway, any active runner actor executing for a previous thread is paused/suspended as an exit action of the previous state or entry action of `checkingStatus` (the actor completes its current execution step, persists the checkpoint, and terminates).

### 3. Resolved State Machine Design Decisions

- **Navigation during active graph execution**: Resolved using XState **parallel states** (separate `ViewState` and `ExecutionState` regions). Users can navigate away to edit presets, customize workflows, or adjust global settings while a LangGraph run continues executing in the background.
  - **Active-Only Execution Mode**: Switching away from a thread pauses the runner actor, and the thread state in the DB is saved as paused (resolving to `inactive` or `awaitingHumanInput` when queried again).
  - **Background Multi-Thread Execution Mode**: The runner actor continues running in the background, resolving to `executing` when the user navigates back to it.
- **React Router integration**: Resolved by making **React Router the single source of truth** for thread navigation. URL route changes emit a `ROUTE_CHANGED` event containing the route details (e.g. `threadId`), triggering the corresponding state machine transitions (e.g., loading the selected thread). Non-route navigation (such as opening settings modals or CRUD sub-views) is driven directly by XState events. Direct redirects initiated by XState (e.g., redirecting to settings on first-load key checking) are executed as side effects that call React Router's `navigate` function.
- **LangGraph execution state storage**: Resolved by using the **XState Actor Model**. The state machine invokes or spawns a child actor (`graphRunnerActor`) whenever entering the `executing` state. This actor encapsulates the non-serializable LangGraph `CompiledStateGraph` instance and manages execution handles, streaming promises, and DB connections. The parent machine context only stores serializable metadata and handles state transitions by receiving events (`STEP`, `INTERRUPT`, `COMPLETE`, `ERROR`) from the child actor.
- **View-Level Database Error Handling**: Errors occurring during CRUD operations (e.g., editing/deleting threads, presets, or workflows) do not trigger execution-level `ExecutionState.error` transitions. Instead, they write to the context's `errorMessage` property and render a transient Carbon inline notification (`InlineNotification`) in the active CRUD panel or sidebar, allowing the user to retry the action without interrupting any ongoing background execution.
- **API Key Removal Behavior**: If API keys are removed or invalidated in settings, a global event `API_KEYS_REMOVED` is dispatched. This triggers the `ViewState` to transition to `onboarding` from any other state, and the `ExecutionState` to transition to `inactive` (pausing/terminating the current runner actor).

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

#### Question: Background Multi-Thread Execution vs. Active-Only Execution

Should the application support executing multiple LangGraph workflows in the background simultaneously (e.g. running a debate in Thread A while chatting with another agent in Thread B), or should it only support execution on the active thread (pausing/suspending background runs when switching threads)?

##### Response

[UNRESOLVED]

#### Question: Token Usage and Cost Tracking Persistence

The Loop Control Panel tracks estimated token usage and turn counts during workflow runs. Where should these stats be persisted? We propose adding a `stats` field (e.g. `{ totalTokens: number, totalTurns: number }`) to the `threads` database store so the historical usage remains visible on thread reload. Alternatively, these stats could be transient and only computed/displayed for the active run.

##### Response

[UNRESOLVED]

#### Question: Default Presets Seeding for First-Time Users

When a new user loads the application for the first time, they will not have any presets or API keys in the database. When they configure their first API key(s) in Global Settings, should the application automatically seed a set of default presets (e.g., "Default Gemini" using `gemini-2.5-flash`, "Default OpenRouter" using `google/gemini-2.5-flash` or similar) so they can start chatting immediately?

##### Response

[UNRESOLVED]

#### Question: LangGraph Checkpoint Cleanup and Size Management

As users run various agents and workflows, LangGraph creates checkpoints for each state step and persists them in IndexedDB. Over time, these checkpoints can grow significantly in size. Should we implement an automatic cleanup policy (e.g., keeping only the last X checkpoints or cleaning up checkpoints when a thread is deleted/completed), or should we keep all checkpoints indefinitely to allow full historical navigation?

##### Response

[UNRESOLVED]

#### Question: Custom User-Defined JavaScript Tools

Database-modifying actions trigger inline approval cards. However, how should we handle tool execution customizability? Can users define custom JavaScript tools directly in their custom workflow JSON schemas, or are they limited to the built-in system tools (such as `ask_questions` and preset database updates)? If custom tools are permitted, should they run inside a sandboxed environment to prevent security/malicious code risks?

##### Response

[UNRESOLVED]

#### Question: Debating Agent Context Window and Memory Management

In a debate workflow loop, two agents debate potentially infinitely. As the conversation progresses, the message history grows and may exceed the model's token limits or increase API call costs. Should the orchestration graph support a memory-pruning or summary-sliding-window mechanism for agent nodes, or should they always receive the full history?

##### Response

[UNRESOLVED]

#### Question: Error Recovery and Resume Policy in Active Loops

If an API call fails mid-stream or during a workflow step (e.g., rate limit hit, network dropout, or service degradation), how should the graph runner handle the error? Should it immediately transition to the `error` state, pause execution, and render a "Retry Step" button to let the user resume from the same checkpoint, or should it perform automatic exponential backoff/retries behind the scenes before prompting the user?

##### Response

[UNRESOLVED]

#### Question: Unresolved Debate Resolution on Max Loops

If a debate loop reaches the maximum loop limit (e.g., 5 rounds) without the agents calling the `declare_consensus` tool, how should the workflow proceed? Should it automatically route to the `summary` node to compile a summary of the unresolved debate (noting that consensus was not achieved), or should it pause, alert the user, and prompt them to either manually force a consensus/summary, or extend the loop limit?

##### Response

[UNRESOLVED]

#### Question: Custom Tool UI Customization

If custom user-defined tools are supported, how should their outputs and execution states be rendered in the chat feed? Should they always fall back to a generic JSON viewer accordion under "Tool: [Name]", or should the schema allow defining a simple declarative UI form (e.g., with input, select, and checkbox fields) so the user can see/interact with a tailored card?

##### Response

[UNRESOLVED]

#### Question: Support for Single-Select and Input Types in ask_questions

The current `ask_questions` schema assumes multi-select options. Should we support a `type` field (e.g., `"single-select" | "multi-select" | "free-text"`) to allow radio buttons, dropdowns, or purely text-based forms, or is a simple checklist with optional comments sufficient?

##### Response

[UNRESOLVED]

#### Question: Abort and Token Preservation on Thread Switch / App Pause

When a thread execution is paused or the user switches threads, how should we handle the active streaming/HTTP requests? We proposed using an `AbortController` to abort the connection immediately. Should the app also discard any partially received tokens for that step, or should it save the partial message and allow resuming from the exact point of interruption?

##### Response

[UNRESOLVED]

#### Question: Workflow Resumption and Message History Mutations

When editing or deleting a message in the middle of a thread's history, the current message history will deviate from the recorded checkpoints. How should the application align the LangGraph execution state when history mutations occur? We propose that editing/deleting any message before the latest checkpoint should invalidate and delete all subsequent checkpoints for that thread, forcing the graph execution to resume (or rewind) from the last matching checkpoint prior to the mutated message. Alternatively, should we prevent editing historical messages altogether once a workflow has completed?

##### Response

[UNRESOLVED]

#### Question: CORS Proxies for Client-Side-Only API Calls

The application is a client-side-only app deployed to GitHub Pages, executing direct browser-based API calls. While Gemini and OpenRouter support CORS out of the box, other LLM providers (or self-hosted local backends like Ollama/Llama.cpp) may have strict CORS policies that block browser requests. Should the preset configuration and settings page support configuring a custom CORS proxy URL or custom request headers, or should the app strictly support CORS-friendly providers?

##### Response

[UNRESOLVED]

#### Question: Plain-text vs Encrypted API Key Storage in IndexedDB

While IndexedDB is sandboxed to the origin, browser extensions or client-side scripting vulnerabilities (XSS) could theoretically expose stored plain-text keys. Should the application support encrypting API keys with a user-provided master password (using Web Crypto API PBKDF2/AES-GCM), or is plain-text storage acceptable for a static, client-side personal application?

##### Response

[UNRESOLVED]

#### Question: Message Feed Virtualization for Long Threads

For threads with large histories (e.g., after long debate loops of 100+ turns), rendering full rich-markdown and math formatting on all messages can degrade UI performance. Should we implement virtualized scrolling (only rendering messages currently in the viewport), or is it acceptable to rely on browser performance and standard rendering?

##### Response

[UNRESOLVED]

#### Question: Workflow Import/Export Format and Sharing

To facilitate sharing custom agent orchestrations, should we support file-based export/import (e.g., downloading the workflow definition as a `.json` file) and copy-to-clipboard actions, or is manual copy-pasting from the JSON editor pane sufficient?

##### Response

[UNRESOLVED]

#### Question: Parallel Node Execution and State Merge Policies

In a complex custom workflow, multiple agent nodes might execute in parallel. LangGraph supports parallel execution, but how should the state machine merge parallel updates to the message history? Should it interleave them by timestamp, group them by agent, or prevent parallel nodes in custom JSON workflows entirely to simplify execution?

##### Response

[UNRESOLVED]
