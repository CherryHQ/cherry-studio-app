import { ToolRegistry } from '@cherrystudio/ai-runtime/tools';
import { asSchema, type Tool } from 'ai';

import type { DeviceToolAccess, ToolApplyScope, ToolEntry } from '../../../../types';
import { registerBuiltinTools } from '../registerBuiltinTools';
import { DEVICE_TOOL_NAMES } from '../toolNames';

const deviceToolNames = Object.values(DEVICE_TOOL_NAMES).sort();
const WRITE_TOOL_NAMES = new Set<string>([
  DEVICE_TOOL_NAMES.calendarCreateEvent,
  DEVICE_TOOL_NAMES.calendarDeleteEvent,
  DEVICE_TOOL_NAMES.calendarUpdateEvent,
  DEVICE_TOOL_NAMES.reminderCreateItem,
  DEVICE_TOOL_NAMES.reminderDeleteItem,
  DEVICE_TOOL_NAMES.reminderUpdateItem,
]);
const permissionScopes = [
  'calendar.read',
  'calendar.write',
  'health.read',
  'location.read',
  'reminders.read',
  'reminders.write',
] as const;

describe('registerBuiltinTools', () => {
  test('registers the exact domain-first device catalog and web tools', () => {
    const registry = createRegistry();
    expect(registry.getAll().map((entry) => entry.name)).toEqual(
      [...deviceToolNames, 'web_fetch', 'web_search'].sort(),
    );

    for (const entry of deviceEntries(registry)) {
      expect(entry.defer).toBe('never');
      expect(entry.namespace).toBe(entry.name.split('_')[0]);
      expect(entry.tool.strict).toBe(true);
      expect(entry.tool.outputSchema).toBeDefined();
    }
    expect(registry.getByName('web_fetch')).toMatchObject({ defer: 'auto', namespace: 'web' });
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
          'location.read': 'denied',
        }),
      }),
    );
    expect(deniedLocation.some((entry) => entry.name === 'location_get_current')).toBe(false);
  });

  test('always requires approval for writes and not for reads', async () => {
    for (const entry of deviceEntries(createRegistry())) {
      await expect(resolveApproval(entry.tool)).resolves.toBe(WRITE_TOOL_NAMES.has(entry.name));
    }
  });
});

function createRegistry() {
  const registry = new ToolRegistry<ToolApplyScope>();
  registerBuiltinTools(registry, dependencies());
  return registry;
}

function dependencies() {
  return {
    devicePermissions: { getStatusForScope: jest.fn(async () => 'granted' as const) },
    webSearch: { searchKeywords: jest.fn() },
  } as never;
}

function deviceEntries(registry: ToolRegistry<ToolApplyScope>): ToolEntry[] {
  return registry.getAll().filter((entry) => entry.namespace !== 'web');
}

function access(overrides: Partial<DeviceToolAccess> = {}): DeviceToolAccess {
  return Object.fromEntries(
    permissionScopes.map((scope) => [scope, overrides[scope] ?? 'granted']),
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
