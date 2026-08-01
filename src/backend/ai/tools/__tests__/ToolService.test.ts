import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import { tool } from 'ai';
import * as z from 'zod';

import type { ToolEntry } from '../adapters/aiSdk/types';
import { ToolService } from '../ToolService';

describe('ToolService', () => {
  test('merges active built-ins, web search, and assistant MCP entries', async () => {
    const mcpEntry: ToolEntry = {
      defer: 'never',
      description: 'MCP search',
      name: 'mcp__server__search',
      namespace: 'mcp:Server',
      tool: tool({ inputSchema: z.object({ query: z.string() }) }),
    };
    const service = createService({ mcpEntries: [mcpEntry] });

    const result = await service.resolveForRequest({
      assistant: assistant(),
      contextWindow: 1_000_000,
      externalWebSearchEnabled: true,
    });

    expect(Object.keys(result.tools ?? {}).sort()).toEqual(
      [
        'calendar_create_event',
        'calendar_delete_event',
        'calendar_list_collections',
        'calendar_list_events',
        'calendar_update_event',
        'health_get_summary',
        'health_list_workouts',
        'location_get_current',
        'mcp__server__search',
        'reminder_create_item',
        'reminder_delete_item',
        'reminder_list_collections',
        'reminder_list_items',
        'reminder_update_item',
        'web_search',
      ].sort(),
    );
  });

  test('fails closed when a preference lookup fails', async () => {
    const service = createService({ failingKey: 'permissions.location_read' });
    const result = await service.resolveForRequest({
      assistant: assistant(),
      externalWebSearchEnabled: false,
    });
    expect(result.tools).not.toHaveProperty('location_get_current');
    expect(result.tools).toHaveProperty('calendar_list_events');
  });

  test('does not register web search when the request uses provider-native search', async () => {
    const result = await createService({}).resolveForRequest({
      assistant: assistant(),
      externalWebSearchEnabled: false,
    });
    expect(result.tools).not.toHaveProperty('web_search');
  });

  test('does not query native permission status for disabled scopes', async () => {
    const getStatus = jest.fn(async () => 'granted');
    const service = createService({
      getStatus,
      neverKey: 'permissions.health_read',
    });

    await service.resolveForRequest({
      assistant: assistant(),
      externalWebSearchEnabled: false,
    });

    expect(getStatus).not.toHaveBeenCalledWith('permissions.health_read');
  });
});

function createService(options: {
  failingKey?: string;
  getStatus?: jest.Mock;
  mcpEntries?: ToolEntry[];
  neverKey?: string;
}) {
  return new ToolService({
    devicePermission: {
      getStatusForPreference: options.getStatus ?? jest.fn(async () => 'granted'),
    },
    mcpRuntime: { getToolEntriesForAssistant: jest.fn(async () => options.mcpEntries ?? []) },
    preference: {
      get: jest.fn(async (key: string) => {
        if (key === options.failingKey) throw new Error('db unavailable');
        if (key === options.neverKey) return 'never';
        return 'always';
      }),
    },
    webSearch: { searchKeywords: jest.fn() },
  } as never);
}

function assistant(): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
