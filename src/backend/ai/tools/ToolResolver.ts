import { applyDeferExposition, ToolRegistry } from '@cherrystudio/ai-runtime/tools';
import type { PermissionPreferenceKey } from '@cherrystudio/universal/data/preference';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { ToolSet } from 'ai';
import { Platform } from 'react-native';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { DevicePermissions } from '@/backend/services/permissions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { ProviderSetupModule } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { McpRuntimeService } from '../mcp';
import { registerBuiltinTools } from './adapters/aiSdk/builtin/registerBuiltinTools';
import { reportToolRuntimeDiagnostic } from './toolRuntimeDiagnostics';
import type { DeviceToolAccess, ToolApplyScope, ToolEntry } from './types';

const logger = loggerService.withContext('ToolResolver');
const DEVICE_PREFERENCE_KEYS = [
  'permissions.calendar_read',
  'permissions.calendar_write',
  'permissions.health_read',
  'permissions.location_read',
  'permissions.reminders_read',
  'permissions.reminders_write',
] as const satisfies readonly PermissionPreferenceKey[];

export type ToolResolverDependencies = {
  devicePermissions: Pick<DevicePermissions, 'getStatusForPreference'>;
  mcpRuntime: Pick<McpRuntimeService, 'getToolEntriesForAssistant'>;
  preference: Pick<PreferenceService, 'get'>;
  providerSetup: Pick<
    ProviderSetupModule,
    'executeBuiltin' | 'executeCustom' | 'listProviders' | 'resolveBuiltin'
  >;
  webSearch: WebSearchService;
};

export class ToolResolver {
  private readonly builtinRegistry = new ToolRegistry<ToolApplyScope>(reportToolRuntimeDiagnostic);

  constructor(private readonly deps: ToolResolverDependencies) {
    registerBuiltinTools(this.builtinRegistry, deps);
  }

  async resolveForRequest(input: {
    assistant?: Assistant;
    contextWindow?: number;
    mcpToolIds?: readonly string[];
  }): Promise<{ deferredEntries: ToolEntry[]; hasMcpTools: boolean; tools: ToolSet | undefined }> {
    if (!input.assistant) {
      const providerConfigurationEnabled = await this.getProviderConfigurationEnabled();
      const activeBuiltins = this.builtinRegistry.selectActive({
        deviceAccess: unavailableDeviceAccess(),
        platform: Platform.OS,
        providerConfigurationEnabled,
      });
      return materializeTools(
        activeBuiltins.filter((entry) => entry.namespace === 'provider-configuration'),
        input.contextWindow,
      );
    }

    const [deviceAccess, mcpEntries, providerConfigurationEnabled] = await Promise.all([
      this.getDeviceAccess(),
      this.deps.mcpRuntime.getToolEntriesForAssistant(input.assistant, input.mcpToolIds),
      this.getProviderConfigurationEnabled(),
    ]);
    const activeBuiltins = this.builtinRegistry.selectActive({
      assistant: input.assistant,
      deviceAccess,
      platform: Platform.OS,
      providerConfigurationEnabled,
    });

    return materializeTools([...activeBuiltins, ...mcpEntries], input.contextWindow, {
      // MOBILE SYNC DIVERGENCE: desktop gates OVMS `/no_think` on selected MCP ids. Mobile uses
      // materialized entries so a missing or filtered tool cannot change the model prompt.
      hasMcpTools: mcpEntries.length > 0,
    });
  }

  private async getDeviceAccess(): Promise<DeviceToolAccess> {
    const entries = await Promise.all(
      DEVICE_PREFERENCE_KEYS.map(async (key) => {
        try {
          const mode = await this.deps.preference.get(key);
          if (mode === 'never') {
            return [key, { mode, status: 'unavailable' as const }] as const;
          }
          const status = await this.deps.devicePermissions.getStatusForPreference(key);
          return [key, { mode, status }] as const;
        } catch (error) {
          logger.warn('Device access lookup failed; disabling the affected scope', { error, key });
          return [key, { mode: 'never' as const, status: 'unavailable' as const }] as const;
        }
      }),
    );
    return Object.fromEntries(entries) as DeviceToolAccess;
  }

  private async getProviderConfigurationEnabled(): Promise<boolean> {
    try {
      return await this.deps.preference.get('chat.tools.provider_configuration.enabled');
    } catch (error) {
      logger.warn('Provider configuration preference lookup failed; disabling tools', { error });
      return false;
    }
  }
}

function materializeTools(
  entries: readonly ToolEntry[],
  contextWindow?: number,
  options: { hasMcpTools?: boolean } = {},
): { deferredEntries: ToolEntry[]; hasMcpTools: boolean; tools: ToolSet | undefined } {
  const requestRegistry = new ToolRegistry<ToolApplyScope>(reportToolRuntimeDiagnostic);
  for (const entry of entries) requestRegistry.register(entry);
  const tools = toToolSet(requestRegistry.getAll());
  return {
    ...applyDeferExposition(tools, requestRegistry, contextWindow),
    hasMcpTools: options.hasMcpTools ?? false,
  };
}

function unavailableDeviceAccess(): DeviceToolAccess {
  return Object.fromEntries(
    DEVICE_PREFERENCE_KEYS.map((key) => [
      key,
      { mode: 'never' as const, status: 'unavailable' as const },
    ]),
  ) as DeviceToolAccess;
}

function toToolSet(entries: readonly ToolEntry[]): ToolSet | undefined {
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.tool]));
}
