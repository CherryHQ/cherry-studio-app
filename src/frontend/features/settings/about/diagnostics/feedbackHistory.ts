import { cacheService } from '@/frontend/data/CacheService';
import {
  DiagnosticFeedbackRecordSchema,
  type DiagnosticFeedbackRecord,
  type DiagnosticReportStatusResult,
} from '@/shared/contracts/diagnostics';

export const FEEDBACK_HISTORY_KEY = 'diagnostics.feedback_history';

export function feedbackHistoryRecords(value: unknown): DiagnosticFeedbackRecord[] {
  const records = new Map<string, DiagnosticFeedbackRecord>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = DiagnosticFeedbackRecordSchema.safeParse(entry);
      if (parsed.success && !records.has(parsed.data.reportId))
        records.set(parsed.data.reportId, parsed.data);
    }
  }
  return [...records.values()].sort(
    (left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt),
  );
}

export function rememberFeedback(reportId: string, description: string): void {
  const record = DiagnosticFeedbackRecordSchema.parse({
    reportId,
    description,
    submittedAt: new Date().toISOString(),
    processingStatus: 'pending',
    isUnavailable: false,
  });
  const records = feedbackHistoryRecords(cacheService.getPersist(FEEDBACK_HISTORY_KEY));
  cacheService.setPersist(FEEDBACK_HISTORY_KEY, [
    record,
    ...records.filter((entry) => entry.reportId !== reportId),
  ]);
}

export function forgetFeedback(reportId: string): void {
  const records = feedbackHistoryRecords(cacheService.getPersist(FEEDBACK_HISTORY_KEY));
  cacheService.setPersist(
    FEEDBACK_HISTORY_KEY,
    records.filter((entry) => entry.reportId !== reportId),
  );
}

export function rememberFeedbackStatus(
  reportId: string,
  result: DiagnosticReportStatusResult,
): void {
  if (result.status === 'failed') return;
  const records = feedbackHistoryRecords(cacheService.getPersist(FEEDBACK_HISTORY_KEY));
  const index = records.findIndex((entry) => entry.reportId === reportId);
  if (index === -1 || (result.status === 'found' && result.reportId !== reportId)) return;
  records[index] = {
    ...records[index],
    lastCheckedAt: new Date().toISOString(),
    isUnavailable: result.status === 'not_found',
    ...(result.status === 'found'
      ? { processingStatus: result.processingStatus, statusUpdatedAt: result.updatedAt }
      : {}),
  };
  cacheService.setPersist(FEEDBACK_HISTORY_KEY, records);
}
