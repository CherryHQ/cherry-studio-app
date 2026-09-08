import type { TraceSpanRecord } from '@/shared/data/types/trace';

import { TraceSession } from '../TraceSession';
import type { TraceRecorder } from '../types';

export function createTraceRecorder() {
  const records: TraceSpanRecord[] = [];
  let sequence = 0;
  const traces: TraceRecorder = {
    startTrace(name, context, attributes) {
      return new TraceSession({
        name,
        context,
        attributes,
        processId: 'test-process',
        traceId: (++sequence).toString(16).padStart(32, '0'),
        newSpanId: () => (++sequence).toString(16).padStart(16, '0'),
        write: (record) => records.push(record),
        onEnd: () => {},
      }).root;
    },
    flush: async () => {},
  };
  return { traces, records };
}
