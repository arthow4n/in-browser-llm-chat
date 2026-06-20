import type { CheckpointTuple } from "./db-schema";
import {
  getLatestCheckpoint,
  getCheckpoint,
  saveCheckpoint,
  saveCheckpointWrite,
  getCheckpointWrites,
  listCheckpoints as dbListCheckpoints,
  getThread,
  saveThread,
} from "./db-operations";

export interface Checkpointer {
  getLatestCheckpoint(threadId: string, checkpointNs: string): Promise<CheckpointTuple | undefined>;
  getCheckpoint(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ): Promise<CheckpointTuple | undefined>;
  saveCheckpoint(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
    checkpointState: unknown,
    metadata: unknown,
    parentCheckpointId: string | null,
  ): Promise<void>;
  saveWrites(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
    writes: unknown[],
    taskId: string,
  ): Promise<void>;
  listCheckpoints(
    threadId: string,
    checkpointNs: string,
    limit?: number,
    beforeCheckpointId?: string,
  ): AsyncGenerator<CheckpointTuple>;
}

export class IndexedDBCheckpointer implements Checkpointer {
  async getLatestCheckpoint(
    threadId: string,
    checkpointNs: string,
  ): Promise<CheckpointTuple | undefined> {
    const dbCheckpoint = await getLatestCheckpoint(threadId, checkpointNs);
    if (!dbCheckpoint) {
      return undefined;
    }

    const writes = await getCheckpointWrites(threadId, checkpointNs, dbCheckpoint.checkpointId);

    return {
      checkpoint: dbCheckpoint.checkpoint,
      metadata: dbCheckpoint.metadata,
      parentCheckpointId: dbCheckpoint.parentCheckpointId,
      checkpointId: dbCheckpoint.checkpointId,
      checkpointNs: dbCheckpoint.checkpointNs,
      pendingWrites: writes.map((w) => [w.channel, w.value]),
    };
  }

  async getCheckpoint(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ): Promise<CheckpointTuple | undefined> {
    const dbCheckpoint = await getCheckpoint(threadId, checkpointNs, checkpointId);
    if (!dbCheckpoint) {
      return undefined;
    }

    const writes = await getCheckpointWrites(threadId, checkpointNs, checkpointId);

    return {
      checkpoint: dbCheckpoint.checkpoint,
      metadata: dbCheckpoint.metadata,
      parentCheckpointId: dbCheckpoint.parentCheckpointId,
      checkpointId: dbCheckpoint.checkpointId,
      checkpointNs: dbCheckpoint.checkpointNs,
      pendingWrites: writes.map((w) => [w.channel, w.value]),
    };
  }

  async saveCheckpoint(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
    checkpointState: unknown,
    metadata: unknown,
    parentCheckpointId: string | null,
  ): Promise<void> {
    await saveCheckpoint({
      threadId,
      checkpointNs,
      checkpointId,
      checkpoint: checkpointState,
      metadata,
      parentCheckpointId,
      createdAt: Date.now(),
    });

    const thread = await getThread(threadId);
    if (thread) {
      thread.latestCheckpointId = checkpointId;
      thread.latestCheckpointNs = checkpointNs;
      await saveThread(thread);
    }
  }

  async saveWrites(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
    writes: unknown[],
    taskId: string,
  ): Promise<void> {
    const createdAt = Date.now();
    for (let idx = 0; idx < writes.length; idx++) {
      const write = writes[idx];
      let channel = "default";
      let value: unknown = write;

      if (Array.isArray(write) && write.length === 2) {
        channel = String(write[0]);
        value = write[1];
      } else if (write && typeof write === "object" && "channel" in write && "value" in write) {
        channel = String((write as { channel: unknown }).channel);
        value = (write as { value: unknown }).value;
      }

      await saveCheckpointWrite({
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        idx,
        channel,
        value,
        createdAt,
      });
    }
  }

  async *listCheckpoints(
    threadId: string,
    checkpointNs: string,
    limit?: number,
    beforeCheckpointId?: string,
  ): AsyncGenerator<CheckpointTuple> {
    const checkpoints = await dbListCheckpoints(threadId, checkpointNs);

    let filtered = checkpoints;
    if (beforeCheckpointId) {
      const boundaryCp = checkpoints.find((c) => c.checkpointId === beforeCheckpointId);
      if (boundaryCp) {
        filtered = checkpoints.filter((c) => c.createdAt < boundaryCp.createdAt);
      }
    }

    const count = limit !== undefined ? Math.min(limit, filtered.length) : filtered.length;
    for (let i = 0; i < count; i++) {
      const dbCheckpoint = filtered[i];
      const writes = await getCheckpointWrites(threadId, checkpointNs, dbCheckpoint.checkpointId);
      yield {
        checkpoint: dbCheckpoint.checkpoint,
        metadata: dbCheckpoint.metadata,
        parentCheckpointId: dbCheckpoint.parentCheckpointId,
        checkpointId: dbCheckpoint.checkpointId,
        checkpointNs: dbCheckpoint.checkpointNs,
        pendingWrites: writes.map((w) => [w.channel, w.value]),
      };
    }
  }
}
