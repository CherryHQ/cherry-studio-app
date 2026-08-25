import { asSchema, tool } from 'ai';
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

  test('fails closed when a preference lookup fails', async () => {
    const resolver = createResolver({ failingKey: 'permissions.location_read' });
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

  test('exposes generate_image only when a drawing model is configured', async () => {
    const withoutModel = await createResolver({}).resolveForRequest({ assistant: assistant() });
    expect(withoutModel.tools).not.toHaveProperty('generate_image');

    const withModel = await createResolver({
      paintingModelId: 'openai::gpt-image-1',
    }).resolveForRequest({ assistant: assistant() });
    expect(withModel.tools).toHaveProperty('generate_image');

    const schema = (await asSchema(withModel.tools?.generate_image.inputSchema).jsonSchema) as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty('size');
    expect(schema.properties).not.toHaveProperty('image_ids');
  });

  test('fails closed when drawing model lookup fails', async () => {
    const result = await createResolver({
      failingKey: 'feature.paintings.default_model_id',
    }).resolveForRequest({ assistant: assistant() });
    expect(result.tools).not.toHaveProperty('generate_image');
    expect(result.tools).toHaveProperty('calendar_list_events');
  });

  test('does not query native permission status for disabled scopes', async () => {
    const getStatus = jest.fn(async () => 'granted');
    const resolver = createResolver({
      getStatus,
      neverKey: 'permissions.health_read',
    });

    await resolver.resolveForRequest({
      assistant: assistant(),
    });

    expect(getStatus).not.toHaveBeenCalledWith('permissions.health_read');
  });
});

function createResolver(options: {
  failingKey?: string;
  getStatus?: jest.Mock;
  mcpEntries?: ToolEntry[];
  neverKey?: string;
  paintingModelId?: string;
}) {
  return new ToolResolver({
    ai: { generateImage: jest.fn(async () => ({ images: [] })) },
    devicePermissions: {
      getStatusForPreference: options.getStatus ?? jest.fn(async () => 'granted'),
    },
    files: {
      createInternalEntry: jest.fn(),
      discard: jest.fn(),
      readDataUrl: jest.fn(),
      resolve: jest.fn(),
    },
    mcpRuntime: { getToolEntriesForAssistant: jest.fn(async () => options.mcpEntries ?? []) },
    preference: {
      get: jest.fn(async (key: string) => {
        if (key === options.failingKey) throw new Error('db unavailable');
        if (key === options.neverKey) return 'never';
        if (key === 'feature.paintings.default_model_id') return options.paintingModelId ?? null;
        return 'always';
      }),
    },
    providerRegistry: {
      getImageGenerationSupport: jest.fn(() => ({
        modes: {
          generate: {
            supports: { size: { options: ['1024x1024'], type: 'enum' } },
          },
        },
      })),
    },
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
