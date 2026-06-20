import { z } from "zod";

// --- Settings Store ---
export const SettingsKeySchema = z.enum([
  "api_keys",
  "ui_config",
  "default_preset_id",
  "injected_system_messages",
]);
export type SettingsKey = z.infer<typeof SettingsKeySchema>;

export const ApiKeysValueSchema = z.object({
  openRouter: z.string().optional(),
  gemini: z.string().optional(),
});
export type ApiKeysValue = z.infer<typeof ApiKeysValueSchema>;

export const UiConfigValueSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});
export type UiConfigValue = z.infer<typeof UiConfigValueSchema>;

export const DefaultPresetIdValueSchema = z.string().uuid();
export type DefaultPresetIdValue = z.infer<typeof DefaultPresetIdValueSchema>;

export const InjectedSystemMessageSchema = z.object({
  content: z.string(),
  depth: z.number(),
});
export type InjectedSystemMessage = z.infer<typeof InjectedSystemMessageSchema>;

export const InjectedSystemMessagesValueSchema = z.array(InjectedSystemMessageSchema);
export type InjectedSystemMessagesValue = z.infer<typeof InjectedSystemMessagesValueSchema>;

export const SettingSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("api_keys"), value: ApiKeysValueSchema }),
  z.object({ key: z.literal("ui_config"), value: UiConfigValueSchema }),
  z.object({ key: z.literal("default_preset_id"), value: DefaultPresetIdValueSchema }),
  z.object({
    key: z.literal("injected_system_messages"),
    value: InjectedSystemMessagesValueSchema,
  }),
]);
export type Setting = z.infer<typeof SettingSchema>;

// --- Presets Store ---
export const BudgetPolicySchema = z.object({
  maxStepsWithoutUser: z.number(),
  maxTokensPerRun: z.number().nullable(),
});
export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;

export const PresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.enum(["openrouter", "gemini"]),
  model: z.string(),
  apiKey: z.string().optional(),
  temperature: z.number(),
  maxTokens: z.number().nullable().optional(),
  reasoningLevel: z.string().optional(), // optional or customized based on needs
  budgetPolicy: BudgetPolicySchema,
});
export type Preset = z.infer<typeof PresetSchema>;

// --- Workflows Store ---
export const WorkflowNodeSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.string(), z.any()).optional(),
  })
  .catchall(z.any());
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z
  .object({
    source: z.string(),
    target: z.string(),
    condition: z.string().optional(),
  })
  .catchall(z.any());
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isBuiltIn: z.boolean(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  injectedSystemMessages: z.array(InjectedSystemMessageSchema).optional(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// --- Threads Store ---
export const ThreadStatusSchema = z.enum([
  "inactive",
  "executing",
  "awaiting_input",
  "error",
  "deleting",
]);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ActiveInterruptSchema = z.object({
  type: z.enum(["ask_questions", "approval", "budget_exceeded"]),
  toolCallId: z.string().optional(),
  budgetDetails: z
    .object({
      currentTokens: z.number(),
      maxTokens: z.number().nullable(),
      stepCount: z.number(),
    })
    .optional(),
});
export type ActiveInterrupt = z.infer<typeof ActiveInterruptSchema>;

export const DraftAnswerValueSchema = z.object({
  selected: z.array(z.string()).optional(),
  text: z.string().optional(),
});
export type DraftAnswerValue = z.infer<typeof DraftAnswerValueSchema>;

// Record<toolCallId, Record<questionId, DraftAnswerValue>>
export const DraftAnswersSchema = z.record(
  z.string(),
  z.record(z.string(), DraftAnswerValueSchema),
);
export type DraftAnswers = z.infer<typeof DraftAnswersSchema>;

export const TokenStatsSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});
export type TokenStats = z.infer<typeof TokenStatsSchema>;

export const ThreadSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  workflowId: z.string(),
  workflowSnapshot: z.any(), // Serialized JSON snapshot of the workflow
  activePresetId: z.string().uuid(),
  createdAt: z.number(),
  updatedAt: z.number(),
  parentThreadId: z.string().uuid().nullable(),
  parentMessageId: z.string().uuid().nullable(),
  status: ThreadStatusSchema,
  activeInterrupt: ActiveInterruptSchema.nullable(),
  draftAnswers: DraftAnswersSchema.optional(),
  errorMessage: z.string().nullable(),
  latestCheckpointId: z.string().nullable(),
  latestCheckpointNs: z.string().nullable(),
  tokenStats: TokenStatsSchema.nullable(),
});
export type Thread = z.infer<typeof ThreadSchema>;

// --- Messages Store ---
export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum(["text", "reasoning", "tool_call", "tool_result"]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  sequence: z.number().int(),
  role: MessageRoleSchema,
  content: z.string(),
  type: MessageTypeSchema,
  toolCallId: z.string().optional(),
  name: z.string().optional(), // Agent name or tool name
  createdAt: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
  checkpointId: z.string().nullable(),
  checkpointNs: z.string().nullable(),
});
export type Message = z.infer<typeof MessageSchema>;

// --- Checkpoints Store ---
export const CheckpointSchema = z.object({
  threadId: z.string().uuid(),
  checkpointNs: z.string(),
  checkpointId: z.string(),
  checkpoint: z.any(), // Serialized custom runner state: { currentNodeId: string, variables: Record<string, any>, messages: Array<any> }
  metadata: z.any(), // Serialized checkpoint metadata: e.g. timestamp, step
  parentCheckpointId: z.string().nullable(),
  createdAt: z.number(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

// The tuple returned by/passed to checkpointers in some workflows
export interface CheckpointTuple {
  checkpoint: unknown;
  metadata: unknown;
  parentCheckpointId: string | null;
  checkpointId: string;
  checkpointNs: string;
}

// --- Checkpoint Writes Store ---
export const CheckpointWritesSchema = z.object({
  threadId: z.string().uuid(),
  checkpointNs: z.string(),
  checkpointId: z.string(),
  taskId: z.string(),
  idx: z.number(),
  channel: z.string(),
  value: z.any(),
  createdAt: z.number(),
});
export type CheckpointWrites = z.infer<typeof CheckpointWritesSchema>;
