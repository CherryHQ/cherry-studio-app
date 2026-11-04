import type { AiUsageRecordService } from '@/backend/data/services/AiUsageRecordService';
import type { AiUsageRecordSchemas } from '@/shared/data/api/schemas/aiUsageRecords';
import type { HandlersFor } from '@/shared/data/api/types';

type AiUsageRecordData = Pick<
  AiUsageRecordService,
  'list' | 'listInvocations' | 'stats' | 'timeline'
>;

export function createAiUsageRecordHandlers(
  service: AiUsageRecordData,
): HandlersFor<AiUsageRecordSchemas> {
  return {
    '/ai-usage-records': {
      GET: ({ query }) => service.list(query),
    },
    '/ai-usage-records/invocations': { GET: ({ query }) => service.listInvocations(query) },
    '/ai-usage-records/stats': {
      GET: ({ query }) => service.stats(query),
    },
    '/ai-usage-records/timeline': {
      GET: ({ query }) => service.timeline(query),
    },
  };
}
