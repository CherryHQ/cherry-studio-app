import type { ToolSet } from 'ai';
import { Platform } from 'react-native';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { DevicePermissionService } from '@/backend/services/permissions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { PermissionPreferenceKey } from '@cherrystudio/shared/data/preference';
import type { Assistant } from '@cherrystudio/shared/data/types/assistant';

import type { McpRuntimeService } from '../mcp';
import { registerBuiltinTools } from './adapters/aiSdk/builtin/registerBuiltinTools';
import { applyDeferExposition } from './adapters/aiSdk/exposition/applyDeferExposition';
import { ToolRegistry } from './adapters/aiSdk/registry';
import type { DeviceToolAccess, ToolEntry } from './adapters/aiSdk/types';

const logger = loggerService.withContext('ToolService');
const DEVICE_PREFERENCE_KEYS = [
  'permissions.calendar_read',
  'permissions.calendar_write',
  'permissions.health_read',
  'permissions.location_read',
  'permissions.reminders_read',
  'permissions.reminders_write',
] as const satisfies readonly PermissionPreferenceKey[];

export type ToolServiceDependencies = {
  devicePermission: Pick<DevicePermissionService, 'getStatusForPreference'>;
  mcpRuntime: Pick<McpRuntimeService, 'getToolEntriesForAssistant'>;
  preference: Pick<PreferenceService, 'get'>;
  webSearch: WebSearchService;
};

export class ToolService {
  private readonly builtinRegistry = new ToolRegistry();

  constructor(private readonly deps: ToolServiceDependencies) {
    registerBuiltinTools(this.builtinRegistry, deps);
  }

  async resolveForRequest(input: {
    assistant: Assistant;
    contextWindow?: number;
    externalWebSearchEnabled: boolean;
    mcpToolIds?: readonly string[];
  }): Promise<{ deferredEntries: ToolEntry[]; tools: ToolSet | undefined }> {
    const [deviceAccess, mcpEntries] = await Promise.all([
      this.getDeviceAccess(),
      this.deps.mcpRuntime.getToolEntriesForAssistant(input.assistant, input.mcpToolIds),
    ]);
    const activeBuiltins = this.builtinRegistry.selectActive({
      assistant: input.assistant,
      deviceAccess,
      externalWebSearchEnabled: input.externalWebSearchEnabled,
      platform: Platform.OS,
    });

    const requestRegistry = new ToolRegistry();
    for (const entry of [...activeBuiltins, ...mcpEntries]) requestRegistry.register(entry);
    const tools = toToolSet(requestRegistry.getAll());
    return applyDeferExposition(tools, requestRegistry, input.contextWindow);
  }

  private async getDeviceAccess(): Promise<DeviceToolAccess> {
    const entries = await Promise.all(
      DEVICE_PREFERENCE_KEYS.map(async (key) => {
        try {
          const mode = await this.deps.preference.get(key);
          if (mode === 'never') {
            return [key, { mode, status: 'unavailable' as const }] as const;
          }
          const status = await this.deps.devicePermission.getStatusForPreference(key);
          return [key, { mode, status }] as const;
        } catch (error) {
          logger.warn('Device access lookup failed; disabling the affected scope', { error, key });
          return [key, { mode: 'never' as const, status: 'unavailable' as const }] as const;
        }
      }),
    );
    return Object.fromEntries(entries) as DeviceToolAccess;
  }
}

function toToolSet(entries: readonly ToolEntry[]): ToolSet | undefined {
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.tool]));
}
