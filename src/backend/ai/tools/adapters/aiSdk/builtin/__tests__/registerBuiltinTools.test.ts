import { ToolRegistry } from '@cherrystudio/ai-runtime/tools';
import { asSchema, type Tool } from 'ai';

import type { DeviceToolAccess, ToolApplyScope, ToolEntry } from '../../../../types';
import { registerBuiltinTools } from '../registerBuiltinTools';
import { DEVICE_TOOL_NAMES } from '../toolNames';

const deviceToolNames = Object.values(DEVICE_TOOL_NAMES).sort();
const deviceToolNameSet = new Set<string>(deviceToolNames);
const preferenceKeys = [
  'permissions.calendar_read',
  'permissions.calendar_write',
  'permissions.health_read',
  'permissions.location_read',
  'permissions.reminders_read',
  'permissions.reminders_write',
] as const;

describe('registerBuiltinTools', () => {
  test('registers the exact device, web, and media catalog', () => {
    const registry = createRegistry();
    expect(registry.getAll().map((entry) => entry.name)).toEqual(
      [...deviceToolNames, 'generate_image', 'web_fetch', 'web_search'].sort(),
    );

    for (const entry of deviceEntries(registry)) {
      expect(entry.defer).toBe('never');
      expect(entry.namespace).toBe(entry.name.split('_')[0]);
      expect(entry.tool.strict).toBe(true);
      expect(entry.tool.outputSchema).toBeDefined();
    }
    expect(registry.getByName('web_fetch')).toMatchObject({ defer: 'auto', namespace: 'web' });
    expect(registry.getByName('web_search')).toMatchObject({ defer: 'auto', namespace: 'web' });
    expect(registry.getByName('generate_image')).toMatchObject({
      defer: 'auto',
      namespace: 'media',
    });
    expect(registry.getByName('tool_exec')).toBeUndefined();
  });

  test('uses strict required-only provider schemas for every device tool', async () => {
    for (const entry of deviceEntries(createRegistry())) {
      const schema = (await asSchema(entry.tool.inputSchema).jsonSchema) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect((schema.required ?? []).sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
      expect(JSON.stringify(schema)).not.toContain('default');
    }
  });

  test('keeps reminders iOS-only and filters denied device scopes', () => {
    const registry = createRegistry();
    const android = registry.selectActive(scope({ platform: 'android' }));
    expect(android.some((entry) => entry.namespace === 'reminder')).toBe(false);

    const deniedLocation = registry.selectActive(
      scope({
        deviceAccess: access({
          'permissions.location_read': { mode: 'always', status: 'denied' },
        }),
      }),
    );
    expect(deniedLocation.some((entry) => entry.name === 'location_get_current')).toBe(false);
  });

  test('exposes ask-mode tools inline and resolves approval dynamically', async () => {
    const deps = dependencies('ask');
    const registry = new ToolRegistry<ToolApplyScope>();
    registerBuiltinTools(registry, deps);
    const entry = registry
      .selectActive(scope({ deviceAccess: access({}, 'ask') }))
      .find((item) => item.name === 'location_get_current');
    expect(entry).toBeDefined();
    await expect(resolveApproval(entry?.tool)).resolves.toBe(true);
  });

  test('materializes generate_image only for a configured drawing model', async () => {
    const registry = createRegistry();
    expect(registry.selectActive(scope()).map((entry) => entry.name)).not.toContain(
      'generate_image',
    );

    const configured = registry.selectActive(
      scope({
        paintingModel: {
          support: {
            modes: {
              generate: {
                supports: { size: { options: ['1024x1024'], type: 'enum' } },
              },
            },
          },
          uniqueModelId: 'openai::gpt-image-1',
        },
      }),
    );
    const imageTool = configured.find((entry) => entry.name === 'generate_image');
    expect(imageTool).toBeDefined();
    const schema = (await asSchema(imageTool?.tool.inputSchema).jsonSchema) as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty('size');
    expect(schema.properties).not.toHaveProperty('image_ids');
  });
});

function createRegistry() {
  const registry = new ToolRegistry<ToolApplyScope>();
  registerBuiltinTools(registry, dependencies('always'));
  return registry;
}

function dependencies(mode: 'ask' | 'always') {
  return {
    ai: { generateImage: jest.fn(async () => ({ images: [] })) },
    devicePermissions: { getStatusForPreference: jest.fn(async () => 'granted' as const) },
    files: {
      createInternalEntry: jest.fn(),
      discard: jest.fn(),
      readDataUrl: jest.fn(),
      resolve: jest.fn(),
    },
    preference: { get: jest.fn(async () => mode) },
    providerRegistry: { getImageGenerationSupport: jest.fn() },
    webSearch: { searchKeywords: jest.fn() },
  } as never;
}

function deviceEntries(registry: ToolRegistry<ToolApplyScope>): ToolEntry[] {
  return registry.getAll().filter((entry) => deviceToolNameSet.has(entry.name));
}

function access(
  overrides: Partial<DeviceToolAccess> = {},
  mode: 'ask' | 'always' = 'always',
): DeviceToolAccess {
  return Object.fromEntries(
    preferenceKeys.map((key) => [key, overrides[key] ?? { mode, status: 'granted' }]),
  ) as DeviceToolAccess;
}

function scope(overrides: Partial<ToolApplyScope> = {}): ToolApplyScope {
  return {
    deviceAccess: access(),
    paintingModel: null,
    platform: 'ios',
    ...overrides,
  };
}

async function resolveApproval(tool: Tool | undefined) {
  if (typeof tool?.needsApproval === 'function') {
    return tool.needsApproval({}, { messages: [], toolCallId: 'call-1' });
  }
  return tool?.needsApproval;
}
