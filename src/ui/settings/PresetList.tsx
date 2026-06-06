import React, { useMemo, useEffect } from "react";
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
  Modal,
  InlineNotification,
  DataTableSkeleton,
} from "@carbon/react";

import { presetListMachine } from "./presetListMachine";
import { PresetStore } from "../../db/db";

export const PresetList: React.FC = () => {
  const [state, send] = useMachine(presetListMachine);

  const { presets, sortConfig, pagination, presetToDeleteId, error } = state.context;

  useEffect(() => {
    send({ type: "FETCH_PRESETS" });
  }, [send]);

  const isLoading = state.matches("loading");

  const sortedAndPagedPresets = useMemo(() => {
    let result = [...presets];

    // Sorting
    result.sort((a, b) => {
      const rawA = a[sortConfig.key];
      const rawB = b[sortConfig.key];
      const valA = typeof rawA === "string" || typeof rawA === "number" ? rawA : "";
      const valB = typeof rawB === "string" || typeof rawB === "number" ? rawB : "";
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return result.slice(start, end);
  }, [presets, sortConfig, pagination]);

  const handleSort = (key: keyof PresetStore) => {
    const direction = sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    send({ type: "SORT_CHANGED", key, direction });
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h1>LLM Presets</h1>

      {error && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          onClose={() => send({ type: "FETCH_PRESETS" })}
        />
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
              Name {sortConfig.key === "name" && (sortConfig.direction === "asc" ? "↑" : "↓")}
            </TableHeader>
            <TableHeader onClick={() => handleSort("provider")} style={{ cursor: "pointer" }}>
              Provider{" "}
              {sortConfig.key === "provider" && (sortConfig.direction === "asc" ? "↑" : "↓")}
            </TableHeader>
            <TableHeader onClick={() => handleSort("model")} style={{ cursor: "pointer" }}>
              Model {sortConfig.key === "model" && (sortConfig.direction === "asc" ? "↑" : "↓")}
            </TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading ? (
            <DataTableSkeleton
              headers={[
                { key: "name", header: "Name" },
                { key: "provider", header: "Provider" },
                { key: "model", header: "Model" },
                { key: "actions", header: "Actions" },
              ]}
              rowCount={pagination.pageSize}
            />
          ) : sortedAndPagedPresets.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                style={{ textAlign: "center", padding: "2rem", color: "#525252" }}
              >
                No presets found.
              </TableCell>
            </TableRow>
          ) : (
            sortedAndPagedPresets.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.provider}</TableCell>
                <TableCell>{row.model}</TableCell>
                <TableCell>
                  <Button
                    kind="danger"
                    size="sm"
                    onClick={() => send({ type: "DELETE_REQUESTED", id: row.id })}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <Pagination
          totalItems={presets.length}
          pageSize={pagination.pageSize}
          page={pagination.page}
          pageSizes={[10, 20, 50]}
          onChange={({ page }) => send({ type: "PAGE_CHANGED", page })}
        />
      </div>

      {presetToDeleteId && (
        <Modal
          open={!!presetToDeleteId}
          modalHeading="Delete Preset"
          primaryButtonText="Delete"
          secondaryButtonText="Cancel"
          onRequestClose={() => send({ type: "CANCEL_DELETE" })}
          onRequestSubmit={() => send({ type: "CONFIRM_DELETE" })}
        >
          <p>Are you sure you want to delete this preset? This action cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
};
