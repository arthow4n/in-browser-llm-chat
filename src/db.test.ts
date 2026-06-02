import { expect, test } from "vitest";
import "fake-indexeddb/auto";
import { saveAppState, getAppState } from "./db";

test("IndexedDB saves and loads state successfully", async () => {
  const dummyState = {
    input: "Hello, Antigravity!",
    graphResult: ["Processed: Hello, Antigravity!"],
  };

  await saveAppState("test-session", dummyState);
  const loaded = await getAppState("test-session");

  expect(loaded).toEqual(dummyState);
});
