import { tool } from 'ai';
import * as z from 'zod';

import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import { ToolResolver } from '../ToolResolver';
import type { ToolEntry } from '../types';

describe('ToolResolver', () => {
  test('merges active built-ins, web search, and assistant MCP entries', async () => {
    const mcpEntry: ToolEntry = {
      defer: 'never',
      description: 'MCP search',
      name: 'mcp__server__search',
      namespace: 'mcp:Server',
      tool: tool({ inputSchema: z.object({ query: z.string() }) }),
    };
    const resolver = createResolver({ mcpEntries: [mcpEntry] });

    const result = await resolver.resolveForRequest({
      assistant: assistant(true),
      contextWindow: 1_000_000,
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
        'web_fetch',
        'web_search',
      ].sort(),
    );
    expect(result.hasMcpTools).toBe(true);
  });

  test('fails closed when a system permission lookup fails', async () => {
    const resolver = createResolver({ failingScope: 'location.read' });
    const result = await resolver.resolveForRequest({
      assistant: assistant(),
    });
    expect(result.tools).not.toHaveProperty('location_get_current');
    expect(result.tools).toHaveProperty('calendar_list_events');
  });

  test('does not register web search when the assistant disables it', async () => {
    const result = await createResolver({}).resolveForRequest({
      assistant: assistant(),
    });
    expect(result.tools).not.toHaveProperty('web_search');
    expect(result.tools).not.toHaveProperty('web_fetch');
    expect(result.hasMcpTools).toBe(false);
  });

  test('queries every native permission scope once', async () => {
    const getStatus = jest.fn(async () => 'granted');
    const resolver = createResolver({ getStatus });

    await resolver.resolveForRequest({
      assistant: assistant(),
    });

    expect(getStatus).toHaveBeenCalledTimes(6);
    expect(getStatus).toHaveBeenCalledWith('health.read');
  });
});

function createResolver(options: {
  failingScope?: string;
  getStatus?: jest.Mock;
  mcpEntries?: ToolEntry[];
}) {
  return new ToolResolver({
    devicePermissions: {
      getStatusForScope:
        options.getStatus ??
        jest.fn(async (scope: string) => {
          if (scope === options.failingScope) throw new Error('native unavailable');
          return 'granted';
        }),
    },
    mcpRuntime: { getToolEntriesForAssistant: jest.fn(async () => options.mcpEntries ?? []) },
    webSearch: { searchKeywords: jest.fn() },
  } as never);
}

function assistant(enableWebSearch = false): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '',
    id: '00000000-0000-4000-8000-000000000001',
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, enableWebSearch },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
