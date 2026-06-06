import { createMachine, assign, fromPromise } from "xstate";
import { deleteWorkflow, type WorkflowStore } from "../../db/db.js";
import { getEffectiveWorkflows } from "../../workflow/workflowService.js";

export interface ExtendedWorkflowStore extends WorkflowStore {
  createdAt?: number;
}

export interface WorkflowListContext {
  workflows: ExtendedWorkflowStore[];
  searchQuery: string;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
  totalCount: number;
  deletingWorkflowId: string | null;
  errorMessage: string | null;
}

export type WorkflowListEvent =
  | { type: "FETCH" }
  | { type: "FETCH_SUCCESS"; workflows: ExtendedWorkflowStore[]; totalCount: number }
  | { type: "FETCH_FAILURE"; error: string }
  | { type: "CHANGE_PAGE"; page: number }
  | { type: "CHANGE_SORT"; sortBy: "name" | "createdAt"; sortOrder: "asc" | "desc" }
  | { type: "UPDATE_SEARCH"; query: string }
  | { type: "TRIGGER_DELETE"; workflowId: string }
  | { type: "DELETE_SUCCESS" }
  | { type: "DELETE_FAILURE"; error: string }
  | { type: "DISMISS_ERROR" };

export const workflowListMachine = createMachine({
  types: {} as { context: WorkflowListContext; events: WorkflowListEvent },
  id: "workflowList",
  initial: "loading",
  context: (): WorkflowListContext => ({
    workflows: [],
    searchQuery: "",
    sortBy: "name",
    sortOrder: "asc",
    page: 1,
    pageSize: 10,
    totalCount: 0,
    deletingWorkflowId: null,
    errorMessage: null,
  }),
  states: {
    loading: {
      invoke: {
        src: fromPromise(
          async ({
            input,
          }: {
            input: {
              searchQuery: string;
              sortBy: "name" | "createdAt";
              sortOrder: "asc" | "desc";
              page: number;
              pageSize: number;
            };
          }) => {
            const { searchQuery, sortBy, sortOrder, page, pageSize } = input;

            const allWorkflows: ExtendedWorkflowStore[] = await getEffectiveWorkflows();

            // Filter
            let filtered = allWorkflows;
            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase();
              filtered = allWorkflows.filter(
                (w) =>
                  w.name.toLowerCase().includes(query) ||
                  w.description.toLowerCase().includes(query),
              );
            }

            // Sort
            const sorted = [...filtered];
            sorted.sort((a, b) => {
              let comparison = 0;
              if (sortBy === "name") {
                comparison = a.name.localeCompare(b.name);
              } else if (sortBy === "createdAt") {
                const timeA = a.createdAt ?? 0;
                const timeB = b.createdAt ?? 0;
                comparison = timeA - timeB;
                if (comparison === 0) {
                  comparison = a.name.localeCompare(b.name);
                }
              }
              return sortOrder === "asc" ? comparison : -comparison;
            });

            const totalCount = sorted.length;

            // Paginate
            const startIndex = (page - 1) * pageSize;
            const paginated = sorted.slice(startIndex, startIndex + pageSize);

            return {
              workflows: paginated,
              totalCount,
            };
          },
        ),
        input: ({ context }) => ({
          searchQuery: context.searchQuery,
          sortBy: context.sortBy,
          sortOrder: context.sortOrder,
          page: context.page,
          pageSize: context.pageSize,
        }),
        onDone: {
          target: "idle",
          actions: assign({
            workflows: ({ event }) => event.output.workflows,
            totalCount: ({ event }) => event.output.totalCount,
            errorMessage: () => null,
          }),
        },
        onError: {
          target: "error",
          actions: assign(({ event }) => {
            const err = event.error;
            const message =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Failed to load workflows";
            return { errorMessage: message };
          }),
        },
      },
    },
    idle: {
      on: {
        FETCH: { target: "loading" },
        CHANGE_PAGE: {
          target: "loading",
          actions: assign(({ event }) => {
            if (event.type === "CHANGE_PAGE") {
              return { page: event.page };
            }
            return {};
          }),
        },
        CHANGE_SORT: {
          target: "loading",
          actions: assign(({ event }) => {
            if (event.type === "CHANGE_SORT") {
              return { sortBy: event.sortBy, sortOrder: event.sortOrder, page: 1 };
            }
            return {};
          }),
        },
        UPDATE_SEARCH: {
          target: "loading",
          actions: assign(({ event }) => {
            if (event.type === "UPDATE_SEARCH") {
              return { searchQuery: event.query, page: 1 };
            }
            return {};
          }),
        },
        TRIGGER_DELETE: {
          target: "deleting",
          actions: assign(({ event }) => {
            if (event.type === "TRIGGER_DELETE") {
              return { deletingWorkflowId: event.workflowId };
            }
            return {};
          }),
        },
      },
    },
    deleting: {
      invoke: {
        src: fromPromise(
          async ({
            input,
          }: {
            input: {
              id: string;
            };
          }) => {
            await deleteWorkflow(input.id);
          },
        ),
        input: ({ context }) => ({
          id: context.deletingWorkflowId!,
        }),
        onDone: {
          target: "loading",
          actions: assign({
            deletingWorkflowId: () => null,
          }),
        },
        onError: {
          target: "idle",
          actions: assign(({ event }) => {
            const err = event.error;
            const message =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : "Failed to delete workflow";
            return { errorMessage: message, deletingWorkflowId: null };
          }),
        },
      },
    },
    error: {
      on: {
        FETCH: { target: "loading" },
        DISMISS_ERROR: {
          target: "idle",
          actions: assign({
            errorMessage: () => null,
          }),
        },
      },
    },
  },
});
