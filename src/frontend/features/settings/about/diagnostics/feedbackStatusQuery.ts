import { queryOptions } from '@tanstack/react-query';

import type { DiagnosticsModule } from '@/shared/contracts/diagnostics';

import { rememberFeedbackStatus } from './feedbackHistory';

export function feedbackStatusQueryOptions(module: DiagnosticsModule, reportId: string) {
  return queryOptions({
    queryKey: ['diagnostics', 'reportStatus', reportId] as const,
    queryFn: async ({ signal }) => {
      const result = await module.getReportStatus(reportId, signal);
      signal.throwIfAborted();
      rememberFeedbackStatus(reportId, result);
      return result;
    },
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
