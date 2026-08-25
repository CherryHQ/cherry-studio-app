import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentService } from '@/backend/data/services/AgentService';
import { aiUsageRecordService } from '@/backend/data/services/AiUsageRecordService';
import { assistantService } from '@/backend/data/services/AssistantService';
import { contentSearchService } from '@/backend/data/services/ContentSearchService';
import { entitySearchService } from '@/backend/data/services/EntitySearchService';
import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { jobService } from '@/backend/data/services/JobService';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import { messageService } from '@/backend/data/services/MessageService';
import { modelService } from '@/backend/data/services/ModelService';
import { paintingService } from '@/backend/data/services/PaintingService';
import { providerService } from '@/backend/data/services/ProviderService';
import { topicService } from '@/backend/data/services/TopicService';

export type DataServices = ReturnType<typeof createDataServices>;

/**
 * Names the data-service singletons for the routing table.
 *
 * Every service here is a module singleton that resolves `DbService` through
 * `application` per call, so this builds nothing — it only gives the route
 * registrations one object to read from. `cache` and `preference` are the two
 * lifecycle-owned services the routes also expose; the host constructs those.
 */
export function createDataServices({
  cache,
  preference,
}: {
  cache: CacheService;
  preference: PreferenceService;
}) {
  return {
    // `agent` names the MobileAgentHost in the merged services object; the
    // CRUD data service gets the suffixed key.
    agentData: agentService,
    aiUsageRecord: aiUsageRecordService,
    assistant: assistantService,
    cache,
    contentSearch: contentSearchService,
    entitySearch: entitySearchService,
    fileEntry: fileEntryService,
    job: jobService,
    mcpServer: mcpServerService,
    message: messageService,
    model: modelService,
    painting: paintingService,
    preference,
    provider: providerService,
    topic: topicService,
  };
}
