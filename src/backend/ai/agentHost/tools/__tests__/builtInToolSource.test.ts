import type { RuntimeModel, RuntimeTool } from '@/backend/ai/agent';
import type { DevicePermissionScope, SystemPermissionState } from '@/shared/contracts';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import { createUniqueModelId } from '@/shared/data/types/model';

import { type BuiltInToolSourceDependencies, createBuiltInToolSource } from '../builtInToolSource';
import type { ConfiguredPaintingModel } from '../painting';

const AGENT_ID = '00000000-0000-7000-8000-0000000000a1';
const MODEL: RuntimeModel = { providerId: 'openai', modelId: 'gpt-test' };

describe('createBuiltInToolSource', () => {
  test('offers the always-available catalog when nothing is granted or configured', async () => {
    const tools = await resolve({ deviceAccess: {}, paintingModel: null });

    // Every device tool needs a permission and generate_image needs a drawing
    // model, so only the unconditional writer survives.
    expect(capabilityIds(tools)).toEqual(['write_file']);
  });

  test('adds a device tool once every scope it needs is granted', async () => {
    const readOnly = await resolve({ deviceAccess: { 'calendar.read': 'granted' } });
    expect(capabilityIds(readOnly)).toEqual([
      'calendar_list_collections',
      'calendar_list_events',
      'write_file',
    ]);

    const writable = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });
    expect(capabilityIds(writable)).toContain('calendar_create_event');
    expect(capabilityIds(writable)).toContain('calendar_delete_event');
  });

  test('omits a device tool whose permission is merely undetermined', async () => {
    const tools = await resolve({ deviceAccess: { 'location.read': 'undetermined' } });

    expect(capabilityIds(tools)).not.toContain('location_get_current');
  });

  test('reads mutations as ask and lookups as auto', async () => {
    const tools = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });

    expect(approvalOf(tools, 'calendar_list_events')).toBe('auto');
    expect(approvalOf(tools, 'calendar_create_event')).toBe('ask');
  });

  test('leaves web tools out until a binding opts in', async () => {
    const unbound = await resolve({});
    expect(capabilityIds(unbound)).not.toContain('web_search');

    const bound = await resolve({
      bindings: [binding({ capabilityId: 'web_search', approval: 'auto' })],
    });
    expect(capabilityIds(bound)).toContain('web_search');
    expect(approvalOf(bound, 'web_search')).toBe('auto');
  });

  test('offers generate_image only with a configured drawing model', async () => {
    const withoutModel = await resolve({ paintingModel: null });
    expect(capabilityIds(withoutModel)).not.toContain('generate_image');

    const withModel = await resolve({ paintingModel: paintingModel() });
    expect(capabilityIds(withModel)).toContain('generate_image');
    expect(approvalOf(withModel, 'generate_image')).toBe('ask');
  });

  test('drops a capability an Agent binding disabled', async () => {
    const tools = await resolve({
      bindings: [binding({ capabilityId: 'write_file', enabled: false })],
    });

    expect(capabilityIds(tools)).toEqual([]);
  });

  test('keeps a denied capability in the snapshot so the call settles as denied', async () => {
    const tools = await resolve({
      bindings: [binding({ capabilityId: 'write_file', approval: 'deny' })],
    });

    expect(approvalOf(tools, 'write_file')).toBe('deny');
  });

  test('lets a binding tighten a default-auto capability', async () => {
    const tools = await resolve({
      bindings: [binding({ capabilityId: 'write_file', approval: 'ask' })],
    });

    expect(approvalOf(tools, 'write_file')).toBe('ask');
  });

  test('omits iOS-only capabilities on Android', async () => {
    const tools = await resolve(
      { deviceAccess: { 'reminders.read': 'granted' } },
      { platform: 'android' },
    );

    expect(capabilityIds(tools)).not.toContain('reminder_list_items');
  });

  test('returns nothing for a model that cannot call tools', async () => {
    const tools = await resolve({ supportsToolCalling: false });

    expect(tools).toEqual([]);
  });

  test('fails closed when the Agent bindings cannot be read', async () => {
    const source = createBuiltInToolSource(
      dependencies({
        listBindings: async () => {
          throw new Error('database unavailable');
        },
      }),
    );

    // The Host turns this into a tool-less turn rather than one authorized by
    // catalog defaults the user may have overridden.
    await expect(source.getTools({ agentId: AGENT_ID, model: MODEL })).rejects.toThrow(
      'database unavailable',
    );
  });

  test('describes every tool with a stable built-in ref and JSON Schema input', async () => {
    const tools = await resolve({
      deviceAccess: { 'location.read': 'granted' },
      paintingModel: paintingModel(),
      bindings: [binding({ capabilityId: 'web_search' })],
    });

    for (const tool of tools) {
      expect(tool.ref.source).toBe('builtin');
      expect(tool.providerName).toBe(
        tool.ref.source === 'builtin' ? tool.ref.capabilityId : undefined,
      );
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.inputSchema).not.toHaveProperty('$schema');
    }
  });
});

type Scenario = {
  bindings?: AgentToolBinding[];
  deviceAccess?: Partial<Record<DevicePermissionScope, SystemPermissionState>>;
  listBindings?: BuiltInToolSourceDependencies['listBindings'];
  paintingModel?: ConfiguredPaintingModel | null;
  supportsToolCalling?: boolean;
};

async function resolve(
  scenario: Scenario,
  options: { platform?: string } = {},
): Promise<readonly RuntimeTool[]> {
  const source = createBuiltInToolSource({
    ...dependencies(scenario),
    platform: options.platform ?? 'ios',
  });
  return source.getTools({ agentId: AGENT_ID, model: MODEL });
}

function dependencies(scenario: Scenario): Partial<BuiltInToolSourceDependencies> {
  return {
    devicePermissions: {
      getStatusForScope: async (scope) => scenario.deviceAccess?.[scope] ?? 'denied',
    },
    listBindings: scenario.listBindings ?? (async () => scenario.bindings ?? []),
    painting: {
      ai: { generateImage: jest.fn() },
      files: {
        createInternalEntry: jest.fn(),
        discard: jest.fn(),
        readDataUrl: jest.fn(),
        resolve: jest.fn(),
      },
      preference: {
        get: jest.fn(async () =>
          scenario.paintingModel ? scenario.paintingModel.uniqueModelId : null,
        ),
      },
      providerRegistry: {
        getImageGenerationSupport: () => scenario.paintingModel?.support ?? null,
      },
    } as unknown as BuiltInToolSourceDependencies['painting'],
    supportsToolCalling: async () => scenario.supportsToolCalling ?? true,
    webSearch: { fetchUrls: jest.fn(), searchKeywords: jest.fn() },
  };
}

function paintingModel(): ConfiguredPaintingModel {
  return {
    support: { modes: { generate: { supports: {} } } } as ConfiguredPaintingModel['support'],
    uniqueModelId: createUniqueModelId('openai', 'gpt-image-1'),
  };
}

function binding(
  input: Partial<Extract<AgentToolBinding, { source: 'builtin' }>> & { capabilityId: string },
): AgentToolBinding {
  return {
    agentId: AGENT_ID,
    approval: 'auto',
    createdAt: '2026-08-26T00:00:00.000Z',
    displayNameSnapshot: null,
    enabled: true,
    id: '00000000-0000-4000-8000-0000000000b1',
    source: 'builtin',
    updatedAt: '2026-08-26T00:00:00.000Z',
    ...input,
  };
}

function capabilityIds(tools: readonly RuntimeTool[]): string[] {
  return tools.flatMap((tool) => (tool.ref.source === 'builtin' ? [tool.ref.capabilityId] : []));
}

function approvalOf(tools: readonly RuntimeTool[], capabilityId: string) {
  return tools.find((tool) => tool.providerName === capabilityId)?.approval;
}
