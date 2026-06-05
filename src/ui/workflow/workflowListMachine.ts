import { createMachine, assign, fromPromise } from "xstate";
import { getAllWorkflows, deleteWorkflow, type WorkflowStore } from "../../db/db.js";

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
        src: fromPromise(async ({ input }) => {
          const { searchQuery, sortBy, sortOrder, page, pageSize } = input as {
            searchQuery: string;
            sortBy: "name" | "createdAt";
            sortOrder: "asc" | "desc";
            page: number;
            pageSize: number;
          };

          const allWorkflows = (await getAllWorkflows()) as ExtendedWorkflowStore[];

          // Filter
          let filtered = allWorkflows;
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = allWorkflows.filter(
              (w) =>
                w.name.toLowerCase().includes(query) || w.description.toLowerCase().includes(query),
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
        }),
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
          actions: assign({
            errorMessage: ({ event }) =>
              (event as { error?: { message?: string } }).error?.message ||
              "Failed to load workflows",
          }),
        },
      },
    },
    idle: {
      on: {
        FETCH: { target: "loading" },
        CHANGE_PAGE: {
          target: "loading",
          actions: assign({
            page: ({ event }) => {
              const e = event as WorkflowListEvent;
              return e.type === "CHANGE_PAGE" ? e.page : 1;
            },
          }),
        },
        CHANGE_SORT: {
          target: "loading",
          actions: assign({
            sortBy: ({ event }) => {
              const e = event as WorkflowListEvent;
              return e.type === "CHANGE_SORT" ? e.sortBy : "name";
            },
            sortOrder: ({ event }) => {
              const e = event as WorkflowListEvent;
              return e.type === "CHANGE_SORT" ? e.sortOrder : "asc";
            },
            page: () => 1,
          }),
        },
        UPDATE_SEARCH: {
          target: "loading",
          actions: assign({
            searchQuery: ({ event }) => {
              const e = event as WorkflowListEvent;
              return e.type === "UPDATE_SEARCH" ? e.query : "";
            },
            page: () => 1,
          }),
        },
        TRIGGER_DELETE: {
          target: "deleting",
          actions: assign({
            deletingWorkflowId: ({ event }) => {
              const e = event as WorkflowListEvent;
              return e.type === "TRIGGER_DELETE" ? e.workflowId : null;
            },
          }),
        },
      },
    },
    deleting: {
      invoke: {
        src: fromPromise(async ({ input }) => {
          const { id } = input as { id: string };
          await deleteWorkflow(id);
        }),
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
          actions: assign({
            errorMessage: ({ event }) =>
              (event as { error?: { message?: string } }).error?.message ||
              "Failed to delete workflow",
            deletingWorkflowId: () => null,
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
