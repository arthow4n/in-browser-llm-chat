import { getAllWorkflows } from "../db/db";
import { BUILT_IN_WORKFLOWS } from "./builtInWorkflows";
import type { WorkflowStore } from "../db/db";

/**
 * Returns the combined list of built-in and user-defined workflows.
 * Filters out any built-in workflows that might have been seeded into the database
 * to prevent duplicates.
 */
export async function getEffectiveWorkflows(): Promise<WorkflowStore[]> {
  const dbWorkflows = await getAllWorkflows();

  // Filter out any workflows from the database that are marked as isBuiltIn: true
  // to prevent duplicates with the programmatic definitions.
  const userWorkflows = dbWorkflows.filter((workflow) => !workflow.isBuiltIn);

  // Merge the filtered result with the BUILT_IN_WORKFLOWS array.
  return [...BUILT_IN_WORKFLOWS, ...userWorkflows];
}
