import { StateGraph, Annotation } from "@langchain/langgraph";

// Define the state annotation
export const GraphState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// Define a simple node that processes the message
function dummyNode(state: typeof GraphState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  return {
    messages: [`Processed: ${lastMessage}`],
  };
}

// Create the graph
const workflow = new StateGraph(GraphState)
  .addNode("processor", dummyNode)
  .addEdge("__start__", "processor")
  .addEdge("processor", "__end__");

// Compile the graph
export const dummyGraph = workflow.compile();
export type GraphStateType = typeof GraphState.State;
