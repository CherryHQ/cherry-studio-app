import type { AiUsageRecordEntry } from '@/shared/data/types/aiUsageRecord';

/** Matches the usage ledger's tokens-per-second SQL sort expression. */
export function getAiUsageRecordTokensPerSecond(
  record: Pick<AiUsageRecordEntry, 'outputTokens' | 'timeCompletionMs' | 'timeFirstTokenMs'>,
): number | null {
  if (
    record.outputTokens === null ||
    record.outputTokens <= 0 ||
    record.timeCompletionMs === null ||
    record.timeCompletionMs <= 0
  ) {
    return null;
  }
  const generationMs =
    record.timeFirstTokenMs !== null && record.timeFirstTokenMs < record.timeCompletionMs
      ? record.timeCompletionMs - record.timeFirstTokenMs
      : record.timeCompletionMs;
  return record.outputTokens / (generationMs / 1000);
}
