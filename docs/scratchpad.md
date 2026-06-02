# Scratchpad

This a scratchpad for writing down vague ideas for building this LLM chat app for personal use.

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
    - Here is where the user can define which are the agents involved in an orchestration and their system prompts.
  - Underlying LLM threads used by the workflow should be visible, including reasoning tokens.
  - To begin with, there should be a built-in debate workflow, where the user should be able to seed the debate with a topic, then let 2 agents debate infinitely in a loop until they come to consensus, the agents come to consensus by making tool call to suggest leaving the debate loop, then finally another agent summarise the debate for the user to review.
- LLM provider preset management CRUD
  - Preset = combination of LLM API provider, API key, LLM model, and configs like reasoning/thinking level, API retry policy, budget policy (e.g. force asking for human approval after X steps in the workflow without human user sending an message).
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
- Branching from a certain message in the chat thread: Clone/duplicate the thread up until that message, creating a new thread.

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
  3. The UI detects the pending interrupt and renders a premium form with checkboxes, freetext comment fields, and a "Refuse to answer" button with optional reasoning.
  4. Once submitted, the user's answers are formatted as a `tool` role message and execution resumes.

### 5. Debate Workflow Execution Details

- **Nodes**:
  - `Initiator`: Sets the debate topic and seeds the conversation.
  - `Debater_A` & `Debater_B`: Two agent nodes with conflicting stances or system messages (e.g., Pro vs. Con).
  - `Consensus_Evaluator`: Checks if consensus is reached or if maximum loops are exceeded. If yes, routes to `Summarizer`; if no, loops back to the next debater.
- **Safety / Cost Control**:
  - Max loop limit (default: 5 rounds of debate / 10 turns) to prevent infinite loops and runaway API costs.
  - The debaters themselves must call a `declare_consensus` tool when they agree, which terminates the loop.
  - The workflow configuration must support forcing a minimum of X rounds of loop before the `declare_consensus` tool is given to the debaters (X can be set to 0 to disable this forced loop).

### 6. System Message Injection Details

- System messages to automatically inject are configured per workflow or globally.
- **Insertion Depth**:
  - Depth `0`: Prepend to the very beginning of the messages list.
  - Depth `N` (positive): Insert after the N-th message.
  - Depth `-N` (negative): Insert N messages from the end of the history.
- When sending context to the LLM API, these messages are inserted on-the-fly but are **never** persisted to the IndexedDB `messages` store for that thread.
