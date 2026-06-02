import { expect, test } from "vitest";
import { dummyGraph } from "./graph";

test("LangGraph workflow processes input message correctly", async () => {
  const result = await dummyGraph.invoke({ messages: ["Hello, Graph!"] });
  expect(result.messages).toContain("Processed: Hello, Graph!");
});
