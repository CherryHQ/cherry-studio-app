import { DIAGNOSTIC_SOURCE_LIMIT_BYTES } from '@/shared/contracts/diagnostics';

import type { ChatRecordCandidate } from '../chatRecordCollector';
import { createDiagnosticBudgetSelector, selectBundleSources } from '../sourceSelection';
import type { SourceCandidate } from '../types';

function file(
  name: string,
  kind: 'logs' | 'traces',
  bytes: number,
  latestAt: number,
): SourceCandidate {
  return {
    archiveName: name,
    eligibleBytes: bytes,
    identity: { size: bytes, modifiedAt: latestAt, fileKey: name },
    kind,
    latestAt,
    malformedLineCount: 0,
    sourcePath: name,
  };
}
function chat(id: string, context: string, latestAt: number): ChatRecordCandidate {
  return {
    id,
    kind: 'chatRecords',
    latestAt,
    contextId: context,
    messageId: id,
    contextRecord: { archiveName: 'chats/agent-sessions.jsonl', bytes: 100, key: context },
    messageRecord: { archiveName: 'chats/agent-session-messages.jsonl', bytes: 100, key: id },
  };
}

test('shared chat context consumes budget only once', () => {
  const selector = createDiagnosticBudgetSelector(300);
  expect(
    selector.trySelect({
      item: null,
      key: 'a',
      kind: 'chatRecords',
      latestAt: 1,
      parts: [
        { key: 'session', bytes: 100 },
        { key: 'a', bytes: 100 },
      ],
    }),
  ).toBe(true);
  expect(
    selector.trySelect({
      item: null,
      key: 'b',
      kind: 'chatRecords',
      latestAt: 1,
      parts: [
        { key: 'session', bytes: 100 },
        { key: 'b', bytes: 100 },
      ],
    }),
  ).toBe(true);
  expect(
    selector.trySelect({
      item: null,
      key: 'c',
      kind: 'logs',
      latestAt: 1,
      parts: [{ key: 'c', bytes: 1 }],
    }),
  ).toBe(false);
});

test('represents each source before filling the budget and accounts for omitted chat records', async () => {
  const logs = file('logs/new', 'logs', DIAGNOSTIC_SOURCE_LIMIT_BYTES - 500, 30);
  const olderLog = file('logs/old', 'logs', 500, 20);
  const traces = file('traces/one', 'traces', 200, 10);
  const selection = await selectBundleSources([logs, olderLog, traces], {
    warnings: new Set(),
    candidates: (async function* () {
      yield chat('a', 'session', 15);
      yield chat('b', 'session', 5);
      yield chat('c', 'session', 1);
    })(),
  });
  expect(selection.selectedFiles).toEqual([logs, traces]);
  expect(selection.omittedFiles).toEqual([olderLog]);
  expect(selection.selectedChats.map((entry) => entry.id)).toEqual(['a', 'b']);
  expect(selection.allChatStats).toEqual({ bytes: 400, messageCount: 3, recordCount: 4 });
  expect(selection.omittedChats).toBe(true);
});
