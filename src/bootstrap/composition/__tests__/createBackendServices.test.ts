import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { CacheService } from '@/backend/data/CacheService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import type { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';

import { createBackendServices } from '../createBackendServices';

const mockDataServices = {
  aiUsageRecord: { kind: 'ai-usage-record' },
  assistant: { kind: 'assistant' },
  dataOnly: { kind: 'data-only' },
  fileEntry: { kind: 'file-entry' },
  fileRef: { kind: 'file-ref' },
  mcpServer: { kind: 'mcp-server' },
  model: { kind: 'model' },
  preference: { kind: 'preference' },
  provider: { kind: 'provider' },
};
const mockPlatformAdapters = {
  devicePermissions: { kind: 'device-permissions' },
  fileContent: { kind: 'file-content' },
  platformOnly: { kind: 'platform-only' },
};
const mockAiServices = {
  ai: { kind: 'ai' },
  aiOnly: { kind: 'ai-only' },
  mcpRuntime: { kind: 'mcp-runtime' },
  tools: { kind: 'tools' },
  webSearch: { kind: 'web-search' },
};
const mockOauth = { getCopilotServingToken: jest.fn(), kind: 'oauth' };
const mockOauthSession = {
  authenticatedFetch: jest.fn(),
  kind: 'oauth-session',
};

const mockCreateDataServices = jest.fn((_dependencies: unknown) => mockDataServices);
const mockCreatePlatformAdapters = jest.fn((_dependencies: unknown) => mockPlatformAdapters);
const mockCreateAiServices = jest.fn((_dependencies: unknown) => mockAiServices);

jest.mock('../createDataServices', () => ({
  createDataServices: (dependencies: unknown) => mockCreateDataServices(dependencies),
}));
jest.mock('../createPlatformAdapters', () => ({
  createPlatformAdapters: (dependencies: unknown) => mockCreatePlatformAdapters(dependencies),
}));
jest.mock('../createAiServices', () => ({
  createAiServices: (dependencies: unknown) => mockCreateAiServices(dependencies),
}));

describe('createBackendServices', () => {
  test('assembles ownership modules through their narrow dependencies', () => {
    const cache = { kind: 'cache' } as unknown as CacheService;
    const mcpRuntime = { kind: 'mcp-runtime' } as unknown as McpRuntimeService;
    // Both OAuth services arrive from the host now, like the four above them.
    const oauth = mockOauth as unknown as ProviderOAuthService;
    const oauthSession = mockOauthSession as unknown as OAuthRuntimeService;
    const preference = { kind: 'preference' } as unknown as PreferenceService;
    const webSearch = { kind: 'web-search' } as unknown as WebSearchService;

    const services = createBackendServices({
      cache,
      mcpRuntime,
      oauth,
      oauthSession,
      preference,
      webSearch,
    });

    expect(mockCreateDataServices).toHaveBeenCalledWith({ cache, preference });
    expect(mockCreatePlatformAdapters).toHaveBeenCalledWith({
      fileEntry: mockDataServices.fileEntry,
      fileRef: mockDataServices.fileRef,
    });
    expect(mockCreateAiServices).toHaveBeenCalledWith(
      expect.objectContaining({
        aiUsageRecord: mockDataServices.aiUsageRecord,
        assistant: mockDataServices.assistant,
        devicePermissions: mockPlatformAdapters.devicePermissions,
        fileContent: mockPlatformAdapters.fileContent,
        mcpRuntime,
        model: mockDataServices.model,
        oauth: {
          authenticatedFetch: expect.any(Function),
          getCopilotServingToken: expect.any(Function),
        },
        preference: mockDataServices.preference,
        provider: mockDataServices.provider,
      }),
    );
    expect(services).toEqual({
      ...mockDataServices,
      ...mockPlatformAdapters,
      ...mockAiServices,
      oauth: mockOauth,
      oauthSession: mockOauthSession,
    });
  });
});
