import { ToolRegistry } from '@cherrystudio/ai-runtime/tools';
import {
  type ConfigureBuiltinProviderInput,
  configureBuiltinProviderInputSchema,
  type CreateCustomProviderInput,
  createCustomProviderInputSchema,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
import { asSchema, type Tool } from 'ai';

import type { DeviceToolAccess, ToolApplyScope, ToolEntry } from '../../../../types';
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
  test('registers the exact device, provider configuration, and web catalogs', () => {
    const registry = createRegistry();
    expect(registry.getAll().map((entry) => entry.name)).toEqual(
      [
        ...deviceToolNames,
        'configure_builtin_provider',
        'create_custom_provider',
        'web_fetch',
        'web_search',
      ].sort(),
    );

    for (const entry of deviceEntries(registry)) {
      expect(entry.defer).toBe('never');
      expect(entry.namespace).toBe(entry.name.split('_')[0]);
      expect(entry.tool.strict).toBe(true);
      expect(entry.tool.outputSchema).toBeDefined();
    }
    expect(registry.getByName('web_fetch')).toMatchObject({ defer: 'auto', namespace: 'web' });
    expect(registry.getByName('web_search')).toMatchObject({ defer: 'auto', namespace: 'web' });
    expect(providerEntries(registry)).toEqual([
      expect.objectContaining({
        defer: 'never',
        name: 'configure_builtin_provider',
        namespace: 'provider-configuration',
      }),
      expect.objectContaining({
        defer: 'never',
        name: 'create_custom_provider',
        namespace: 'provider-configuration',
      }),
    ]);
    expect(registry.getByName('tool_exec')).toBeUndefined();
  });

  test('uses strict required-only schemas for provider configuration tools', async () => {
    const entries = providerEntries(createRegistry());
    expect(entries.map((entry) => entry.tool.inputSchema)).toEqual([
      configureBuiltinProviderInputSchema,
      createCustomProviderInputSchema,
    ]);

    for (const entry of entries) {
      const schema = (await asSchema(entry.tool.inputSchema).jsonSchema) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(entry.tool.strict).toBe(true);
      expect(entry.tool.outputSchema).toBeDefined();
      expect((schema.required ?? []).sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
      expect(JSON.stringify(schema)).not.toContain('"default":');
    }
  });

  test('only approves a built-in provider after it resolves uniquely', async () => {
    const deps = dependencies('always');
    const registry = new ToolRegistry<ToolApplyScope>();
    registerBuiltinTools(registry, deps as never);
    const builtin = registry.getByName('configure_builtin_provider')?.tool;
    const custom = registry.getByName('create_custom_provider')?.tool;

    await expect(resolveApproval(builtin, { provider: 'Unknown' })).resolves.toBe(false);
    deps.providerSetup.resolveBuiltin.mockResolvedValueOnce({
      apiKeyCount: 0,
      canEditEndpoint: true,
      origin: 'https://api.example.com',
      provider: { id: 'example', name: 'Example' },
      status: 'matched',
    } as never);
    await expect(resolveApproval(builtin, { provider: 'Example' })).resolves.toBe(true);
    await expect(resolveApproval(custom)).resolves.toBe(true);
  });

  test('filters both provider tools when the shared scope is disabled', () => {
    expect(
      createRegistry()
        .selectActive(scope({ providerConfigurationEnabled: false }))
        .some((entry) => entry.namespace === 'provider-configuration'),
    ).toBe(false);
  });

  test('forwards provider inputs and cancellation to execution', async () => {
    const deps = dependencies('always');
    const registry = new ToolRegistry<ToolApplyScope>();
    registerBuiltinTools(registry, deps as never);
    const signal = new AbortController().signal;
    const builtinInput: ConfigureBuiltinProviderInput = {
      apiKey: 'key',
      baseUrl: '',
      intent: 'configure',
      manualModels: [],
      provider: 'CherryIN',
      removedModelIds: [],
      selectedModelIds: [],
      skipModelPull: false,
    };
    const customInput: CreateCustomProviderInput = {
      anthropicUrl: '',
      apiKey: 'key',
      baseUrl: 'https://api.example.com/v1',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      geminiUrl: '',
      imageEditUrl: '',
      imageGenerationUrl: '',
      intent: 'configure',
      manualModels: [],
      name: 'Example',
      openaiResponsesUrl: '',
      providerId: 'provider-id',
      removedModelIds: [],
      selectedModelIds: [],
      skipModelPull: false,
    };

    await execute(registry.getByName('configure_builtin_provider')?.tool, builtinInput, signal);
    await execute(registry.getByName('create_custom_provider')?.tool, customInput, signal);

    expect(deps.providerSetup.executeBuiltin).toHaveBeenCalledWith(builtinInput, signal);
    expect(deps.providerSetup.executeCustom).toHaveBeenCalledWith(customInput, signal);
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
    registerBuiltinTools(registry, deps as never);
    const entry = registry
      .selectActive(scope({ deviceAccess: access({}, 'ask') }))
      .find((item) => item.name === 'location_get_current');
    expect(entry).toBeDefined();
    await expect(resolveApproval(entry?.tool)).resolves.toBe(true);
  });
});

function createRegistry() {
  const registry = new ToolRegistry<ToolApplyScope>();
  registerBuiltinTools(registry, dependencies('always') as never);
  return registry;
}

function dependencies(mode: 'ask' | 'always') {
  return {
    devicePermissions: { getStatusForPreference: jest.fn(async () => 'granted' as const) },
    preference: { get: jest.fn(async () => mode) },
    providerSetup: {
      executeBuiltin: jest.fn(),
      executeCustom: jest.fn(),
      resolveBuiltin: jest.fn(async () => ({
        candidates: [],
        message: 'No matching provider.',
        status: 'not-found' as const,
      })),
    },
    webSearch: { searchKeywords: jest.fn() },
  };
}

function deviceEntries(registry: ToolRegistry<ToolApplyScope>): ToolEntry[] {
  return registry
    .getAll()
    .filter((entry) => !['provider-configuration', 'web'].includes(entry.namespace));
}

function providerEntries(registry: ToolRegistry<ToolApplyScope>): ToolEntry[] {
  return registry.getAll({ namespace: 'provider-configuration' });
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
    providerConfigurationEnabled: true,
    ...overrides,
  };
}

async function resolveApproval(tool: Tool | undefined, input: Record<string, unknown> = {}) {
  if (typeof tool?.needsApproval === 'function') {
    return tool.needsApproval(input, { messages: [], toolCallId: 'call-1' });
  }
  return tool?.needsApproval;
}

function execute(tool: Tool | undefined, input: unknown, signal: AbortSignal) {
  if (!tool?.execute) throw new Error('Tool is not executable');
  return tool.execute(input, {
    abortSignal: signal,
    messages: [],
    toolCallId: 'call-1',
  });
}
