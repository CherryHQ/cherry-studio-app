import type { TraceContext, TraceSpanRecord } from '@/shared/data/types/trace';

import { sanitizeTraceAttributes } from './traceAttributes';
import type { TraceAttributes, TraceEndStatus, TraceSpan } from './types';

const MAX_SPANS_PER_TRACE = 256;

type OpenSpan = {
  record: TraceSpanRecord;
  monotonicStart: number;
};

type TraceSessionOptions = {
  traceId: string;
  processId: string;
  name: string;
  context?: TraceContext;
  attributes?: TraceAttributes;
  newSpanId(): string;
  write(record: TraceSpanRecord): void;
  onEnd(): void;
  now?: () => number;
  monotonicNow?: () => number;
};

/** One caller-owned trace; only open spans are retained in memory. */
export class TraceSession {
  readonly root: TraceSpan;
  private readonly openSpans = new Map<string, OpenSpan>();
  private readonly context: TraceContext;
  private spanCount = 0;
  private droppedSpans = 0;
  private ended = false;
  private readonly now: () => number;
  private readonly monotonicNow: () => number;

  constructor(private readonly options: TraceSessionOptions) {
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.context = {};
    for (const key of ['agentId', 'sessionId', 'turnId', 'messageId', 'requestId'] as const) {
      const value = options.context?.[key];
      if (typeof value === 'string') this.context[key] = value.slice(0, 256);
    }
    this.root = this.createSpan(options.name, null, options.attributes);
  }

  private createSpan(
    name: string,
    parentSpanId: string | null,
    attributes?: TraceAttributes,
  ): TraceSpan {
    const spanId = this.options.newSpanId();
    const record: TraceSpanRecord = {
      schemaVersion: 1,
      revision: 1,
      capture: 'metadata',
      processId: this.options.processId,
      traceId: this.options.traceId,
      spanId,
      parentSpanId,
      name: name.slice(0, 128),
      context: this.context,
      attributes: sanitizeTraceAttributes(attributes),
      status: 'running',
      startedAt: this.now(),
    };
    this.openSpans.set(spanId, { record, monotonicStart: this.monotonicNow() });
    this.spanCount += 1;
    this.write(record);

    return {
      traceId: record.traceId,
      spanId,
      startSpan: (childName, childAttributes) => {
        try {
          if (this.ended || !this.openSpans.has(spanId)) return undefined;
          if (this.spanCount >= MAX_SPANS_PER_TRACE) {
            this.droppedSpans += 1;
            return undefined;
          }
          return this.createSpan(childName, spanId, childAttributes);
        } catch {
          return undefined;
        }
      },
      setAttributes: (next) => {
        try {
          const open = this.openSpans.get(spanId);
          if (open) {
            open.record = {
              ...open.record,
              attributes: sanitizeTraceAttributes({ ...open.record.attributes, ...next }),
            };
          }
        } catch {
          // Observability must not alter execution when an attribute cannot be inspected.
        }
      },
      end: (status, finalAttributes) => {
        try {
          this.endSpan(spanId, status, finalAttributes);
        } catch {
          // An exporter or clock failure must not escape into the caller.
        }
      },
    };
  }

  private endSpan(spanId: string, status: TraceEndStatus, attributes?: TraceAttributes): void {
    const open = this.openSpans.get(spanId);
    if (!open) return;
    const isRoot = open.record.parentSpanId === null;
    if (isRoot) {
      this.ended = true;
      for (const id of this.openSpans.keys()) {
        if (id !== spanId) this.endSpan(id, status === 'cancelled' ? 'cancelled' : 'interrupted');
      }
    }
    this.openSpans.delete(spanId);
    this.write({
      ...open.record,
      revision: open.record.revision + 1,
      status,
      endedAt: this.now(),
      durationMs: Math.max(0, this.monotonicNow() - open.monotonicStart),
      attributes: sanitizeTraceAttributes({
        ...open.record.attributes,
        ...attributes,
        ...(isRoot && this.droppedSpans > 0 ? { 'trace.dropped_spans': this.droppedSpans } : {}),
      }),
    });
    if (isRoot) this.options.onEnd();
  }

  private write(record: TraceSpanRecord): void {
    try {
      this.options.write(record);
    } catch {
      // The trace remains usable if one diagnostic record cannot be stored.
    }
  }
}
