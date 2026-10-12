import { z } from 'zod';

import { createHttpClient } from '@/backend/services/http';
import {
  DIAGNOSTIC_API_ORIGIN,
  DiagnosticProcessingStatusSchema,
  DiagnosticReportIdSchema,
  type DiagnosticReportStatusResult,
} from '@/shared/contracts/diagnostics';

const http = createHttpClient({
  baseUrl: DIAGNOSTIC_API_ORIGIN,
  headers: { Accept: 'application/json' },
  statusPolicy: 'all',
  timeoutMs: 10_000,
});
const StatusResponseSchema = z.object({
  id: DiagnosticReportIdSchema,
  status: DiagnosticProcessingStatusSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export async function getDiagnosticReportStatus(
  reportId: string,
  signal?: AbortSignal,
): Promise<DiagnosticReportStatusResult> {
  signal?.throwIfAborted();
  if (!DiagnosticReportIdSchema.safeParse(reportId).success) return { status: 'not_found' };
  try {
    const response = await http.request<unknown>({
      method: 'GET',
      path: `/diagnostics/${reportId}/status`,
      logPath: '/diagnostics/[report-id]/status',
      maxResponseBytes: 64 * 1024,
      redirect: 'error',
      signal,
    });
    signal?.throwIfAborted();
    if (response.status === 404) return { status: 'not_found' };
    if (response.status === 429) return { status: 'failed', reason: 'rate_limited' };
    if (response.status === 200) {
      const parsed = StatusResponseSchema.safeParse(response.data);
      if (parsed.success && parsed.data.id === reportId) {
        return {
          status: 'found',
          reportId,
          processingStatus: parsed.data.status,
          createdAt: parsed.data.created_at,
          updatedAt: parsed.data.updated_at,
        };
      }
    }
  } catch {
    signal?.throwIfAborted();
  }
  return { status: 'failed', reason: 'unavailable' };
}
