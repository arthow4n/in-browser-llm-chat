import React, { useEffect } from "react";
import { useMachine } from "@xstate/react";
import {
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Button,
  Pagination,
  Search,
  InlineNotification,
  DataTableSkeleton,
} from "@carbon/react";
import { workflowListMachine } from "./workflowListMachine.js";

interface WorkflowListProps {
  onEditWorkflow?: (id: string) => void;
  onCreateWorkflow?: () => void;
}

export const WorkflowList: React.FC<WorkflowListProps> = ({ onEditWorkflow, onCreateWorkflow }) => {
  const [state, send] = useMachine(workflowListMachine);

  const {
    workflows,
    searchQuery,
    sortBy,
    sortOrder,
    page,
    pageSize,
    totalCount,
    deletingWorkflowId,
    errorMessage,
  } = state.context;

  useEffect(() => {
    send({ type: "FETCH" });
  }, [send]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    send({ type: "UPDATE_SEARCH", query: e.target.value });
  };

  const handleClearSearch = () => {
    send({ type: "UPDATE_SEARCH", query: "" });
  };

  const handleSort = (field: "name" | "createdAt") => {
    const nextOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    send({ type: "CHANGE_SORT", sortBy: field, sortOrder: nextOrder });
  };

  const handleDelete = (id: string) => {
    send({ type: "TRIGGER_DELETE", workflowId: id });
  };

  const isLoading = state.matches("loading");
  const isDeleting = state.matches("deleting");
  const isDisabled = isLoading || isDeleting;

  return (
    <div style={{ padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "600" }}>Custom Workflows</h1>
          <p style={{ color: "#525252", fontSize: "0.875rem" }}>
            Manage and configure custom LLM orchestration graphs.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            size="md"
            kind="secondary"
            disabled={isDisabled}
            onClick={() => {
              // Placeholders/Buttons for import, can be hooked up later
            }}
          >
            Import Workflow
          </Button>
          <Button size="md" kind="primary" disabled={isDisabled} onClick={onCreateWorkflow}>
            Create Workflow
          </Button>
        </div>
      </div>

      {errorMessage && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={errorMessage}
          onClose={() => send({ type: "DISMISS_ERROR" })}
          style={{ marginBottom: "1rem", maxWidth: "100%" }}
        />
      )}

      <div style={{ marginBottom: "1rem" }}>
        <Search
          id="workflow-search"
          labelText="Search workflows"
          placeholder="Search by name or description..."
          value={searchQuery}
          onChange={handleSearch}
          onClear={handleClearSearch}
          disabled={isDisabled}
        />
      </div>

      {isLoading ? (
        <DataTableSkeleton
          headers={[
            { key: "name", header: "Name" },
            { key: "description", header: "Description" },
            { key: "type", header: "Type" },
            { key: "actions", header: "Actions" },
          ]}
          rowCount={pageSize}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader
                  onClick={() => handleSort("name")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Name {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {workflows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    style={{ textAlign: "center", padding: "2rem", color: "#525252" }}
                  >
                    No workflows found.
                  </TableCell>
                </TableRow>
              ) : (
                workflows.map((flow) => {
                  const isFlowDeleting = deletingWorkflowId === flow.id;
                  return (
                    <TableRow key={flow.id}>
                      <TableCell style={{ fontWeight: "500" }}>{flow.name}</TableCell>
                      <TableCell>{flow.description}</TableCell>
                      <TableCell>{flow.isBuiltIn ? "Built-in" : "Custom"}</TableCell>
                      <TableCell>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            disabled={isDisabled}
                            onClick={() => onEditWorkflow?.(flow.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            kind="danger"
                            size="sm"
                            disabled={isDisabled || flow.isBuiltIn}
                            onClick={() => handleDelete(flow.id)}
                          >
                            {isFlowDeleting ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <Pagination
              totalItems={totalCount}
              pageSize={pageSize}
              page={page}
              pageSizes={[10, 20, 50]}
              onChange={({ page }) => send({ type: "CHANGE_PAGE", page })}
              disabled={isDisabled}
            />
          </div>
        </>
      )}
    </div>
  );
};
