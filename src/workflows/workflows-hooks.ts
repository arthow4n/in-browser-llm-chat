import { useState, useEffect, useCallback } from "react";
import type { Workflow } from "../db/db-schema";
import {
  listWorkflows,
  getWorkflow,
  saveWorkflow as serviceSaveWorkflow,
  deleteWorkflow as serviceDeleteWorkflow,
} from "./workflows-service";

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listWorkflows();
      setWorkflows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const saveWorkflow = async (workflow: Workflow) => {
    try {
      await serviceSaveWorkflow(workflow);
      await loadWorkflows();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to save workflow";
      setError(errMsg);
      throw err;
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await serviceDeleteWorkflow(id);
      await loadWorkflows();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to delete workflow";
      setError(errMsg);
      throw err;
    }
  };

  return {
    workflows,
    isLoading,
    error,
    refresh: loadWorkflows,
    saveWorkflow,
    deleteWorkflow,
  };
}

export function useWorkflow(id: string | undefined) {
  const [workflow, setWorkflow] = useState<Workflow | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setWorkflow(undefined);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    getWorkflow(id)
      .then((data) => {
        if (active) {
          setWorkflow(data);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to get workflow");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { workflow, isLoading, error };
}
