import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type CheckpointPendingWrite,
  type PendingWrite,
  type ChannelVersions,
  copyCheckpoint,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { getDB, type CheckpointStore, type CheckpointWriteStore } from "./db.js";

export class IndexedDBSaver extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      return undefined;
    }
    const ns = config.configurable?.checkpoint_ns ?? "";
    let checkpointId = config.configurable?.checkpoint_id;

    const db = await getDB();
    let record: CheckpointStore | undefined;

    if (checkpointId) {
      record = await db.get("checkpoints", [threadId, ns, checkpointId]);
    } else {
      const all = await db.getAllFromIndex("checkpoints", "by-thread", threadId);
      const filtered = all.filter((r) => r.checkpointNs === ns);
      if (filtered.length === 0) {
        return undefined;
      }
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      record = filtered[0];
      checkpointId = record.checkpointId;
    }

    if (!record) {
      return undefined;
    }

    const ch = record.checkpoint as { type: string; value: Uint8Array };
    const meta = record.metadata as { type: string; value: Uint8Array };
    const deserializedCheckpoint = await this.serde.loadsTyped(ch.type, ch.value);
    const deserializedMetadata = await this.serde.loadsTyped(meta.type, meta.value);

    const writes = await db.getAllFromIndex("checkpoint_writes", "by-thread", threadId);
    const filteredWrites = writes.filter(
      (w) => w.checkpointNs === ns && w.checkpointId === checkpointId,
    );

    const pendingWrites = await Promise.all(
      filteredWrites.map(async (w): Promise<CheckpointPendingWrite> => {
        const v = w.value as { type: string; value: Uint8Array };
        const deserializedValue = await this.serde.loadsTyped(v.type, v.value);
        return [w.taskId, w.channel, deserializedValue];
      }),
    );

    const checkpointTuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: checkpointId,
        },
      },
      checkpoint: deserializedCheckpoint,
      metadata: deserializedMetadata,
      pendingWrites,
    };

    if (record.parentCheckpointId) {
      checkpointTuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: record.parentCheckpointId,
        },
      };
    }

    return checkpointTuple;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions?: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error("Missing thread_id");
    }
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = checkpoint.id;

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const [cpType, cpBytes] = await this.serde.dumpsTyped(preparedCheckpoint);
    const [metaType, metaBytes] = await this.serde.dumpsTyped(metadata);

    const db = await getDB();
    const tx = db.transaction(["checkpoints", "threads"], "readwrite");

    const checkpointRecord: CheckpointStore = {
      threadId,
      checkpointNs,
      checkpointId,
      checkpoint: { type: cpType, value: cpBytes },
      metadata: { type: metaType, value: metaBytes },
      parentCheckpointId: config.configurable?.checkpoint_id ?? null,
      createdAt: Date.now(),
    };

    await tx.objectStore("checkpoints").put(checkpointRecord);

    const threadsStore = tx.objectStore("threads");
    const threadRecord = await threadsStore.get(threadId);
    if (threadRecord) {
      threadRecord.latestCheckpointId = checkpointId;
      threadRecord.latestCheckpointNs = checkpointNs;
      threadRecord.updatedAt = Date.now();
      await threadsStore.put(threadRecord);
    }

    await tx.done;

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error("Missing thread_id");
    }
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id;
    if (!checkpointId) {
      throw new Error("Missing checkpoint_id");
    }

    const db = await getDB();
    const tx = db.transaction("checkpoint_writes", "readwrite");
    const store = tx.objectStore("checkpoint_writes");

    await Promise.all(
      writes.map(async ([channel, value], writeIdx) => {
        const [valType, valBytes] = await this.serde.dumpsTyped(value);
        const calculatedIdx =
          WRITES_IDX_MAP[channel] !== undefined ? WRITES_IDX_MAP[channel] : writeIdx;

        const writeRecord: CheckpointWriteStore = {
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          idx: calculatedIdx,
          channel,
          value: { type: valType, value: valBytes },
          createdAt: Date.now(),
        };

        await store.put(writeRecord);
      }),
    );

    await tx.done;
  }

  async deleteThread(threadId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(["checkpoints", "checkpoint_writes"], "readwrite");

    const checkpointsStore = tx.objectStore("checkpoints");
    const checkpointRecords = await checkpointsStore.index("by-thread").getAll(threadId);
    for (const cp of checkpointRecords) {
      await checkpointsStore.delete([threadId, cp.checkpointNs, cp.checkpointId]);
    }

    const writesStore = tx.objectStore("checkpoint_writes");
    const writeRecords = await writesStore.index("by-thread").getAll(threadId);
    for (const w of writeRecords) {
      await writesStore.delete([threadId, w.checkpointNs, w.checkpointId, w.taskId, w.idx]);
    }

    await tx.done;
  }

  async *list(
    config: RunnableConfig,
    options?: {
      limit?: number;
      before?: RunnableConfig;
      filter?: Record<string, unknown>;
    },
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";

    const db = await getDB();
    let records = threadId
      ? await db.getAllFromIndex("checkpoints", "by-thread", threadId)
      : await db.getAll("checkpoints");

    records = records.filter((r) => r.checkpointNs === checkpointNs);
    records.sort((a, b) => b.createdAt - a.createdAt);

    const { limit, before, filter } = options ?? {};

    if (before?.configurable?.checkpoint_id) {
      const beforeRecord = await db.get("checkpoints", [
        threadId || before.configurable.thread_id,
        before.configurable.checkpoint_ns ?? "",
        before.configurable.checkpoint_id,
      ]);
      if (beforeRecord) {
        records = records.filter((r) => r.createdAt < beforeRecord.createdAt);
      }
    }

    let count = 0;
    for (const r of records) {
      if (limit !== undefined && count >= limit) {
        break;
      }

      const ch = r.checkpoint as { type: string; value: Uint8Array };
      const meta = r.metadata as { type: string; value: Uint8Array };
      const deserializedCheckpoint = await this.serde.loadsTyped(ch.type, ch.value);
      const deserializedMetadata = await this.serde.loadsTyped(meta.type, meta.value);

      if (filter) {
        const matches = Object.entries(filter).every(
          ([key, value]) => deserializedMetadata[key] === value,
        );
        if (!matches) {
          continue;
        }
      }

      const writes = await db.getAllFromIndex("checkpoint_writes", "by-thread", r.threadId);
      const filteredWrites = writes.filter(
        (w) => w.checkpointNs === r.checkpointNs && w.checkpointId === r.checkpointId,
      );
      const pendingWrites = await Promise.all(
        filteredWrites.map(async (w): Promise<CheckpointPendingWrite> => {
          const v = w.value as { type: string; value: Uint8Array };
          const deserializedValue = await this.serde.loadsTyped(v.type, v.value);
          return [w.taskId, w.channel, deserializedValue];
        }),
      );

      const checkpointTuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: r.threadId,
            checkpoint_ns: r.checkpointNs,
            checkpoint_id: r.checkpointId,
          },
        },
        checkpoint: deserializedCheckpoint,
        metadata: deserializedMetadata,
        pendingWrites,
      };

      if (r.parentCheckpointId) {
        checkpointTuple.parentConfig = {
          configurable: {
            thread_id: r.threadId,
            checkpoint_ns: r.checkpointNs,
            checkpoint_id: r.parentCheckpointId,
          },
        };
      }

      yield checkpointTuple;
      count++;
    }
  }
}
