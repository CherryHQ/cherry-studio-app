import { asSchema, type Tool } from 'ai';

import { ToolRegistry } from '../../registry';
import type { DeviceToolAccess, ToolApplyScope, ToolEntry } from '../../types';
import { registerBuiltinTools } from '../registerBuiltinTools';
import { DEVICE_TOOL_NAMES } from '../toolNames';

const deviceToolNames = Object.values(DEVICE_TOOL_NAMES).sort();
const preferenceKeys = [
  'permissions.calendar_read',
  'permissions.calendar_write',
  'permissions.health_read',
  'permissions.location_read',
  'permissions.reminders_read',
  'permissions.reminders_write',
] as const;

describe('registerBuiltinTools', () => {
  test('registers the exact domain-first device catalog and web search', () => {
    const registry = createRegistry();
    expect(registry.getAll().map((entry) => entry.name)).toEqual(
      [...deviceToolNames, 'web_search'].sort(),
    );

    for (const entry of deviceEntries(registry)) {
      expect(entry.defer).toBe('never');
      expect(entry.namespace).toBe(entry.name.split('_')[0]);
      expect(entry.tool.strict).toBe(true);
      expect(entry.tool.outputSchema).toBeDefined();
    }
    expect(registry.getByName('web_search')).toMatchObject({ defer: 'auto', namespace: 'web' });
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
    const registry = new ToolRegistry();
    registerBuiltinTools(registry, deps);
    const entry = registry
      .selectActive(scope({ deviceAccess: access({}, 'ask') }))
      .find((item) => item.name === 'location_get_current');
    expect(entry).toBeDefined();
    await expect(resolveApproval(entry?.tool)).resolves.toBe(true);
  });
});

function createRegistry() {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry, dependencies('always'));
  return registry;
}

function dependencies(mode: 'ask' | 'always') {
  return {
    devicePermissions: { getStatusForPreference: jest.fn(async () => 'granted' as const) },
    preference: { get: jest.fn(async () => mode) },
    webSearch: { searchKeywords: jest.fn() },
  } as never;
}

function deviceEntries(registry: ToolRegistry): ToolEntry[] {
  return registry.getAll().filter((entry) => entry.name !== 'web_search');
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
