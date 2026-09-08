import { DIAGNOSTIC_SOURCE_LIMIT_BYTES } from '@/shared/contracts/diagnostics';

import { addChatRecordStats } from './chatRecordCollector';
import type { ChatRecordCollection, ChatRecordCandidate } from './chatRecordCollector';
import type { ChatRecordStats, DiagnosticSourceKind, SourceCandidate } from './types';

interface DiagnosticBudgetPart {
  readonly bytes: number;
  readonly key: string;
}

export interface DiagnosticBudgetCandidate<T> {
  readonly item: T;
  readonly key: string;
  readonly kind: DiagnosticSourceKind;
  readonly latestAt: number;
  readonly parts: readonly DiagnosticBudgetPart[];
}

export function compareBudgetCandidates(
  a: DiagnosticBudgetCandidate<unknown>,
  b: DiagnosticBudgetCandidate<unknown>,
): number {
  return b.latestAt - a.latestAt || (a.key > b.key ? 1 : a.key < b.key ? -1 : 0);
}

export function createDiagnosticBudgetSelector(limitBytes: number): {
  trySelect(candidate: DiagnosticBudgetCandidate<unknown>): boolean;
} {
  const selectedPartKeys = new Set<string>();
  let remainingBytes = limitBytes;

  const trySelect = (candidate: DiagnosticBudgetCandidate<unknown>): boolean => {
    const candidatePartKeys = new Set<string>();
    let bytes = 0;
    for (const part of candidate.parts) {
      if (selectedPartKeys.has(part.key) || candidatePartKeys.has(part.key)) continue;
      candidatePartKeys.add(part.key);
      bytes += part.bytes;
    }
    if (bytes > remainingBytes) return false;
    remainingBytes -= bytes;
    for (const key of candidatePartKeys) selectedPartKeys.add(key);
    return true;
  };

  return { trySelect };
}

export function toFileBudgetCandidate(
  candidate: SourceCandidate,
): DiagnosticBudgetCandidate<SourceCandidate> {
  return {
    item: candidate,
    key: candidate.archiveName,
    kind: candidate.kind,
    latestAt: candidate.latestAt,
    parts: [{ key: candidate.archiveName, bytes: candidate.eligibleBytes }],
  };
}

export function toChatBudgetCandidate(
  candidate: ChatRecordCandidate,
): DiagnosticBudgetCandidate<ChatRecordCandidate> {
  return {
    item: candidate,
    key: candidate.id,
    kind: candidate.kind,
    latestAt: candidate.latestAt,
    parts: [candidate.messageRecord, candidate.contextRecord].map((part) => ({
      key: part.key,
      bytes: part.bytes,
    })),
  };
}

type BundleSourceCandidate = ChatRecordCandidate | SourceCandidate;

export async function selectBundleSources(
  fileCandidates: readonly SourceCandidate[],
  chatCollection: ChatRecordCollection,
): Promise<{
  allChatStats: ChatRecordStats;
  expectedChatArchiveNames: ReadonlySet<string>;
  omittedChats: boolean;
  omittedFiles: SourceCandidate[];
  selectedChats: ChatRecordCandidate[];
  selectedFiles: SourceCandidate[];
}> {
  const sortedFiles = fileCandidates.map(toFileBudgetCandidate).sort(compareBudgetCandidates);
  const chatIterator = chatCollection.candidates[Symbol.asyncIterator]();
  const selectedChats: ChatRecordCandidate[] = [];
  const selectedFileCandidates = new Set<DiagnosticBudgetCandidate<SourceCandidate>>();
  const selector = createDiagnosticBudgetSelector(DIAGNOSTIC_SOURCE_LIMIT_BYTES);
  const chatContextRecordKeys = new Set<string>();
  const expectedChatArchiveNames = new Set<string>();
  const allChatStats: ChatRecordStats = { bytes: 0, messageCount: 0, recordCount: 0 };

  const observeChat = (candidate: ChatRecordCandidate): void => {
    addChatRecordStats(allChatStats, chatContextRecordKeys, candidate);
    expectedChatArchiveNames.add(candidate.messageRecord.archiveName);
    expectedChatArchiveNames.add(candidate.contextRecord.archiveName);
  };

  const trySelect = (candidate: DiagnosticBudgetCandidate<BundleSourceCandidate>): void => {
    if (!selector.trySelect(candidate)) return;
    if (candidate.item.kind === 'chatRecords') {
      selectedChats.push(candidate.item);
    } else {
      selectedFileCandidates.add(candidate as DiagnosticBudgetCandidate<SourceCandidate>);
    }
  };

  const firstChatResult = await chatIterator.next();
  const firstChat = firstChatResult.done ? undefined : toChatBudgetCandidate(firstChatResult.value);
  if (firstChat) observeChat(firstChat.item);

  const representatives: DiagnosticBudgetCandidate<BundleSourceCandidate>[] = [];
  for (const kind of ['logs', 'traces'] as const) {
    const representative = sortedFiles.find((candidate) => candidate.kind === kind);
    if (representative) representatives.push(representative);
  }
  if (firstChat) representatives.push(firstChat);
  for (const representative of representatives.sort(compareBudgetCandidates))
    trySelect(representative);

  const representativeSet = new Set(representatives);
  const remainingFiles = sortedFiles.filter((candidate) => !representativeSet.has(candidate));
  let fileIndex = 0;
  let chatResult = await chatIterator.next();
  let currentChat = chatResult.done ? undefined : toChatBudgetCandidate(chatResult.value);
  if (currentChat) observeChat(currentChat.item);

  while (fileIndex < remainingFiles.length || currentChat) {
    const file = remainingFiles[fileIndex];
    if (file && (!currentChat || compareBudgetCandidates(file, currentChat) <= 0)) {
      trySelect(file);
      fileIndex += 1;
      continue;
    }

    if (!currentChat) break;
    trySelect(currentChat);
    chatResult = await chatIterator.next();
    currentChat = chatResult.done ? undefined : toChatBudgetCandidate(chatResult.value);
    if (currentChat) observeChat(currentChat.item);
  }

  return {
    allChatStats,
    expectedChatArchiveNames,
    omittedChats: allChatStats.messageCount > selectedChats.length,
    omittedFiles: sortedFiles
      .filter((candidate) => !selectedFileCandidates.has(candidate))
      .map((candidate) => candidate.item),
    selectedChats,
    selectedFiles: sortedFiles
      .filter((candidate) => selectedFileCandidates.has(candidate))
      .map((candidate) => candidate.item),
  };
}
