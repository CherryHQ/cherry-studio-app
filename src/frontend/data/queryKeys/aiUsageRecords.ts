import type {
  AiUsageRecordListQueryParams,
  AiUsageRecordStatsQueryParams,
  AiUsageRecordTimelineQueryParams,
} from '@/shared/data/api/schemas/aiUsageRecords';

export const aiUsageRecordQueryKeys = {
  list: (query: AiUsageRecordListQueryParams = {}) => ['/ai-usage-records', query] as const,
  stats: (query: AiUsageRecordStatsQueryParams) => ['/ai-usage-records/stats', query] as const,
  timeline: (query: AiUsageRecordTimelineQueryParams) =>
    ['/ai-usage-records/timeline', query] as const,
};
