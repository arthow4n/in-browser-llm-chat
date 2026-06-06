import { setupServer } from "msw/node";
import { beforeAll, afterEach, afterAll } from "vitest";
import { llmHandlers } from "./handlers";

export const server = setupServer(...llmHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
