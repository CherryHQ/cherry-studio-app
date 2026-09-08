import { randomUUID } from 'expo-crypto';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { TraceContext, TraceSpanRecord } from '@/shared/data/types/trace';

import { traceFileStorage } from './traceFileStorage';
import { TraceSession } from './TraceSession';
import type {
  TraceAttributes,
  TraceDiagnosticSnapshot,
  TraceFileStorage,
  TraceRecorder,
  TraceSpan,
  TraceStorageDiagnostics,
} from './types';

const logger = loggerService.withContext('TraceStorageService');
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_BATCH_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_ACTIVE_TRACES = 32;
const FLUSH_INTERVAL_MS = 1_000;

type BufferedRecord = { line: string; bytes: number };

@Injectable('TraceStorageService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('continue')
export class TraceStorageService extends BaseService implements TraceRecorder {
  private readonly active = new Set<TraceSpan>();
  private readonly pending: BufferedRecord[] = [];
  private readonly diagnostics: TraceStorageDiagnostics = { droppedRecords: 0, writeFailures: 0 };
  private readonly encoder = new TextEncoder();
  private pendingBytes = 0;
  private processId: string | undefined;
  private accepting = true;
  private queue: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | undefined;

  constructor(private readonly storage: TraceFileStorage = traceFileStorage) {
    super();
  }

  protected override onInit(): void {
    this.accepting = true;
    this.registerInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    this.registerAppStateListener((state) => {
      if (state !== 'active') void this.flush();
    });
    void this.enqueue(async () => this.storage.prune(Date.now()));
  }

  startTrace(
    name: string,
    context?: TraceContext,
    attributes?: TraceAttributes,
  ): TraceSpan | undefined {
    if (!this.accepting || this.active.size >= MAX_ACTIVE_TRACES) {
      this.diagnostics.droppedRecords += 1;
      return undefined;
    }
    try {
      this.processId ??= randomUUID();
      const session = new TraceSession({
        processId: this.processId,
        traceId: randomUUID().replaceAll('-', ''),
        name,
        context,
        attributes,
        newSpanId: () => randomUUID().replaceAll('-', '').slice(0, 16),
        write: (record) => this.record(record),
        onEnd: () => {
          this.active.delete(session.root);
          void this.flush();
        },
      });
      this.active.add(session.root);
      void this.flush();
      return session.root;
    } catch {
      this.diagnostics.droppedRecords += 1;
      return undefined;
    }
  }

  /** Joins serialized disk work; tracing callers never receive storage failures. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    const operation = this.enqueue(async () => {
      while (this.pending.length > 0) {
        const batch: BufferedRecord[] = [];
        let bytes = 0;
        while (this.pending.length > 0 && bytes + this.pending[0].bytes <= MAX_BATCH_BYTES) {
          const next = this.pending.shift()!;
          batch.push(next);
          bytes += next.bytes;
        }
        this.pendingBytes -= bytes;
        try {
          await this.storage.writeBatch(
            batch.map(({ line }) => line),
            Date.now(),
          );
        } catch {
          this.diagnostics.droppedRecords += batch.length;
          this.recordWriteFailure();
        }
        try {
          await this.storage.prune(Date.now());
        } catch {
          // Retention failure does not mean an already committed batch was lost.
          this.recordWriteFailure();
        }
      }
    });
    this.flushing = operation.finally(() => {
      this.flushing = undefined;
      if (this.pending.length > 0) void this.flush();
    });
    return this.flushing;
  }

  /** The returned files are private copies, unaffected by subsequent capture and retention. */
  async createDiagnosticSnapshot(): Promise<TraceDiagnosticSnapshot> {
    await this.flush();
    const snapshot = this.queue.then(() =>
      this.storage.snapshot(Date.now(), { ...this.diagnostics }),
    );
    this.queue = snapshot.then(
      () => {},
      () => {},
    );
    return snapshot;
  }

  protected override async onStop(): Promise<void> {
    for (const span of this.active) span.end('interrupted');
    this.active.clear();
    this.accepting = false;
    await this.flush();
    await this.queue;
  }

  private record(record: TraceSpanRecord): void {
    if (!this.accepting) return;
    let line = JSON.stringify(record);
    if (this.encoder.encode(line).byteLength > MAX_RECORD_BYTES) {
      line = JSON.stringify({ ...record, attributes: { 'trace.attributes_truncated': true } });
    }
    const bytes = this.encoder.encode(line).byteLength + 1;
    if (bytes > MAX_RECORD_BYTES || this.pendingBytes + bytes > MAX_BUFFER_BYTES) {
      this.diagnostics.droppedRecords += 1;
      return;
    }
    this.pending.push({ line, bytes });
    this.pendingBytes += bytes;
    if (this.pendingBytes >= MAX_BATCH_BYTES) void this.flush();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation).catch(() => {
      this.recordWriteFailure();
    });
    this.queue = result;
    return result;
  }

  private recordWriteFailure(): void {
    this.diagnostics.writeFailures += 1;
    logger.warn('Trace storage operation failed', {
      writeFailures: this.diagnostics.writeFailures,
    });
  }
}
