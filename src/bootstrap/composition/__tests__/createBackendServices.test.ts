import type { CacheService } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';

import { createBackendServices } from '../createBackendServices';

const mockDataServices = {
  aiUsageRecord: { kind: 'ai-usage-record' },
  assistant: { kind: 'assistant' },
  dataOnly: { kind: 'data-only' },
  fileEntry: { kind: 'file-entry' },
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
    const dbService = { kind: 'database' } as unknown as DbService;

    const services = createBackendServices(dbService, cache);

    expect(mockCreateDataServices).toHaveBeenCalledWith({ cache, dbService });
    expect(mockCreatePlatformAdapters).toHaveBeenCalledWith({
      fileEntry: mockDataServices.fileEntry,
    });
    expect(mockCreateAiServices).toHaveBeenCalledWith({
      aiUsageRecord: mockDataServices.aiUsageRecord,
      assistant: mockDataServices.assistant,
      devicePermissions: mockPlatformAdapters.devicePermissions,
      fileContent: mockPlatformAdapters.fileContent,
      mcpServer: mockDataServices.mcpServer,
      model: mockDataServices.model,
      preference: mockDataServices.preference,
      provider: mockDataServices.provider,
    });
    expect(services).toEqual({
      ...mockDataServices,
      ...mockPlatformAdapters,
      ...mockAiServices,
    });
  });
});
