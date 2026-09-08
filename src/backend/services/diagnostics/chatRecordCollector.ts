import { Directory, File } from 'expo-file-system';

import type { DiagnosticChatReader } from '@/backend/data/services/diagnosticChatRecords';

import { appendBytes, yieldToRuntime } from './diagnosticFiles';
import type {
  ChatRecordStats,
  DiagnosticTimeRange,
  DiagnosticWarning,
  StagedSource,
} from './types';

export const CHAT_ARCHIVE_NAMES = [
  'chats/agent-sessions.jsonl',
  'chats/agent-session-messages.jsonl',
] as const;
type ChatArchiveName = (typeof CHAT_ARCHIVE_NAMES)[number];
type ChatRecordReference = { archiveName: ChatArchiveName; bytes: number; key: string };
export type ChatRecordCandidate = {
  contextId: string;
  contextRecord: ChatRecordReference;
  id: string;
  kind: 'chatRecords';
  latestAt: number;
  messageId: string;
  messageRecord: ChatRecordReference;
};
export type ChatRecordCollection = {
  candidates: AsyncIterable<ChatRecordCandidate>;
  warnings: Set<DiagnosticWarning>;
};
const encode = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);

export function collectChatRecords(
  reader: DiagnosticChatReader,
  range: DiagnosticTimeRange,
  signal?: AbortSignal,
): ChatRecordCollection {
  const warnings = new Set<DiagnosticWarning>();
  const candidates = (async function* (): AsyncGenerator<ChatRecordCandidate> {
    const sessions = new Map<string, ChatRecordReference>();
    let cursor: { id: string; createdAt: number } | undefined;
    try {
      while (true) {
        signal?.throwIfAborted();
        const page = await reader.page(range, cursor);
        if (!page.length) break;
        for (const message of page) {
          let context = sessions.get(message.sessionId);
          if (!context) {
            const session = await reader.session(message.sessionId);
            if (!session) {
              warnings.add('source_changed');
              continue;
            }
            context = {
              archiveName: CHAT_ARCHIVE_NAMES[0],
              bytes: encode(session).length,
              key: `agent-session:${session.id}`,
            };
            sessions.set(session.id, context);
          }
          const id = `agent-session-message:${message.id}`;
          yield {
            contextId: message.sessionId,
            contextRecord: context,
            id,
            kind: 'chatRecords',
            latestAt: message.createdAt,
            messageId: message.id,
            messageRecord: {
              archiveName: CHAT_ARCHIVE_NAMES[1],
              bytes: message.entityJsonBytes + 1,
              key: id,
            },
          };
        }
        const last = page[page.length - 1];
        cursor = { id: last.id, createdAt: last.createdAt };
        await yieldToRuntime();
      }
    } catch {
      signal?.throwIfAborted();
      warnings.add('source_unreadable');
    }
  })();
  return { candidates, warnings };
}

export function addChatRecordStats(
  stats: ChatRecordStats,
  contexts: Set<string>,
  candidate: ChatRecordCandidate,
): void {
  stats.bytes += candidate.messageRecord.bytes;
  stats.messageCount += 1;
  stats.recordCount += 1;
  if (contexts.has(candidate.contextRecord.key)) return;
  contexts.add(candidate.contextRecord.key);
  stats.bytes += candidate.contextRecord.bytes;
  stats.recordCount += 1;
}

export async function scanChatRecordStats(
  candidates: AsyncIterable<ChatRecordCandidate>,
): Promise<ChatRecordStats> {
  const stats = { bytes: 0, messageCount: 0, recordCount: 0 };
  const contexts = new Set<string>();
  for await (const candidate of candidates) addChatRecordStats(stats, contexts, candidate);
  return stats;
}

export async function stageChatRecords(
  reader: DiagnosticChatReader,
  candidates: readonly ChatRecordCandidate[],
  root: Directory,
  limitBytes: number,
  signal?: AbortSignal,
) {
  const included: ChatRecordStats = { bytes: 0, messageCount: 0, recordCount: 0 };
  const contexts = new Set<string>();
  const observed = new Set<string>();
  const warnings = new Set<DiagnosticWarning>();
  const destinations = new Map<ChatArchiveName, File>();
  let observedByteDelta = 0;
  for (const candidate of [...candidates].sort(
    (a, b) => b.latestAt - a.latestAt || a.id.localeCompare(b.id),
  )) {
    signal?.throwIfAborted();
    let records: { data: Uint8Array; reference: ChatRecordReference }[];
    try {
      const message = await reader.message(candidate.contextId, candidate.messageId);
      if (!message) {
        warnings.add('source_changed');
        continue;
      }
      records = [{ data: encode(message), reference: candidate.messageRecord }];
      if (!contexts.has(candidate.contextRecord.key)) {
        const session = await reader.session(candidate.contextId);
        if (!session) {
          warnings.add('source_changed');
          continue;
        }
        records.push({ data: encode(session), reference: candidate.contextRecord });
      }
    } catch {
      warnings.add('source_unreadable');
      continue;
    }
    for (const { data, reference } of records) {
      if (!observed.has(reference.key)) {
        observed.add(reference.key);
        observedByteDelta += data.length - reference.bytes;
        if (data.length !== reference.bytes) warnings.add('source_changed');
      }
    }
    const bytes = records.reduce((total, record) => total + record.data.length, 0);
    if (included.bytes + bytes > limitBytes) {
      warnings.add('size_limit_reached');
      continue;
    }
    try {
      for (const { data, reference } of records) {
        let file = destinations.get(reference.archiveName);
        if (!file) {
          file = new File(root, reference.archiveName);
          destinations.set(reference.archiveName, file);
        }
        appendBytes(file, data);
      }
    } catch (error) {
      for (const file of destinations.values()) {
        try {
          if (file.exists) file.delete();
        } catch {
          /* Temporary root is cleaned by caller. */
        }
      }
      throw error;
    }
    contexts.add(candidate.contextRecord.key);
    included.bytes += bytes;
    included.messageCount += 1;
    included.recordCount += records.length;
    await yieldToRuntime();
  }
  const sources: StagedSource[] = [...destinations].map(([archiveName, file]) => ({
    archiveName,
    bytes: file.size,
    kind: 'chatRecords',
    malformedLineCount: 0,
    path: file.uri,
  }));
  return { included, observedByteDelta, sources, warnings };
}
