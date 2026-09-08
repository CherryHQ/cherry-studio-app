import { TraceSpanRecordSchema, type TraceSpanRecord } from '@/shared/data/types/trace';

import { traceErrorAttributes } from '../traceAttributes';
import { TraceSession } from '../TraceSession';

function capture(traceId = 'a'.repeat(32)) {
  const records: TraceSpanRecord[] = [];
  let sequence = 0;
  let wallTime = 1000;
  let monotonicTime = 100;
  const session = new TraceSession({
    traceId,
    processId: 'process',
    name: 'ai.turn',
    context: { sessionId: traceId, turnId: 'turn' },
    newSpanId: () => (++sequence).toString(16).padStart(16, '0'),
    write: (record) =>
      records.push(TraceSpanRecordSchema.parse(JSON.parse(JSON.stringify(record)))),
    onEnd: () => {},
    now: () => wallTime,
    monotonicNow: () => monotonicTime,
  });
  return {
    root: session.root,
    records,
    advance() {
      wallTime -= 500;
      monotonicTime += 25;
    },
  };
}

describe('TraceSession', () => {
  it('serializes correlated start/end revisions and measures elapsed time across clock changes', () => {
    const { root, records, advance } = capture();
    const child = root.startSpan('pi.generate_content');
    advance();
    child?.end('ok', { 'gen_ai.usage.input_tokens': 12 });
    root.end('ok');

    expect(records).toHaveLength(4);
    expect(records[1]).toMatchObject({ parentSpanId: root.spanId, revision: 1, status: 'running' });
    expect(records[2]).toMatchObject({
      parentSpanId: root.spanId,
      revision: 2,
      durationMs: 25,
      startedAt: 1000,
      endedAt: 500,
      attributes: { 'gen_ai.usage.input_tokens': 12 },
    });
    expect(records.every((record) => record.context.sessionId === root.traceId)).toBe(true);
  });

  it('closes only its own children on cancellation and ignores late results', () => {
    const first = capture();
    const second = capture('b'.repeat(32));
    const abandoned = first.root.startSpan('provider');
    const remaining = second.root.startSpan('provider');
    first.root.end('cancelled');
    abandoned?.end('ok');
    abandoned?.setAttributes({ late: true });
    expect(first.root.startSpan('late')).toBeUndefined();
    remaining?.end('ok');
    second.root.end('ok');

    expect(first.records).toHaveLength(4);
    expect(first.records.slice(2).map((record) => record.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(second.records.slice(2).map((record) => record.status)).toEqual(['ok', 'ok']);
  });

  it('excludes content-bearing attributes and error bodies while retaining bounded diagnostic facts', () => {
    const { root, records } = capture();
    root.end('error', {
      prompt: 'private prompt',
      authorization: 'Bearer secret',
      'gen_ai.usage.input_tokens': 9,
      'gen_ai.request.model': 'x'.repeat(500),
      ...traceErrorAttributes(
        Object.assign(new Error('private response'), {
          code: 'rate_limit',
          statusCode: 429,
          body: 'private body',
          cause: 'private cause',
        }),
      ),
    });
    expect(records[1].attributes).toEqual({
      'gen_ai.usage.input_tokens': 9,
      'gen_ai.request.model': 'x'.repeat(256),
      'error.type': 'Error',
      'error.code': 'rate_limit',
      'http.status_code': 429,
    });
    expect(JSON.stringify(records)).not.toMatch(/private|Bearer|stack/);
  });

  it('bounds per-trace work and reports spans omitted by the limit', () => {
    const { root, records } = capture();
    for (let index = 0; index < 300; index += 1) root.startSpan('tool')?.end('ok');
    root.end('ok');
    expect(records).toHaveLength(512);
    expect(records.at(-1)?.attributes['trace.dropped_spans']).toBe(45);
  });
});
