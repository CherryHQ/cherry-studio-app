import type { MobileAgentHost } from '@/backend/ai/agent/host/MobileAgentHost';
import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { fileContent } from '@/backend/services/file/fileContent';
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import { devicePermissions } from '@/backend/services/permissions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createBackendServices } from '../createBackendServices';

const mockDataServices = {
  aiUsageRecord: { kind: 'ai-usage-record' },
  dataOnly: { kind: 'data-only' },
  fileEntry: { kind: 'file-entry' },
  mcpServer: { kind: 'mcp-server' },
  model: { kind: 'model' },
  preference: { kind: 'preference' },
  provider: { kind: 'provider' },
};

const mockCreateDataServices = jest.fn((_dependencies: unknown) => mockDataServices);

jest.mock('../createDataServices', () => ({
  createDataServices: (dependencies: unknown) => mockCreateDataServices(dependencies),
}));

describe('createBackendServices', () => {
  test('assembles ownership modules through their narrow dependencies', () => {
    const agent = { kind: 'agent' } as unknown as MobileAgentHost;
    const ai = { kind: 'ai' } as unknown as AiService;
    const cache = { kind: 'cache' } as unknown as CacheService;
    const jobRuntime = { kind: 'job-runtime' } as unknown as JobRuntime;
    const mcpRuntime = { kind: 'mcp-runtime' } as unknown as McpRuntimeService;
    const preference = { kind: 'preference' } as unknown as PreferenceService;
    const webSearch = { kind: 'web-search' } as unknown as WebSearchService;

    const services = createBackendServices({
      agent,
      ai,
      cache,
      jobRuntime,
      mcpRuntime,
      preference,
      webSearch,
    });

    expect(mockCreateDataServices).toHaveBeenCalledWith({ cache, preference });
    // The platform adapters are module singletons rather than constructed
    // dependencies now, so the bundle must carry those exact instances.
    expect(services).toEqual({
      ...mockDataServices,
      agent,
      ai,
      devicePermissions,
      fileContent,
      jobRuntime,
      mcpRuntime,
      webSearch,
    });
    expect(services.devicePermissions).toBe(devicePermissions);
    expect(services.fileContent).toBe(fileContent);
  });
});
