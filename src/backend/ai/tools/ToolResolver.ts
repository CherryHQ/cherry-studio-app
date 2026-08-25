import { applyDeferExposition, ToolRegistry } from '@cherrystudio/ai-runtime/tools';
import type { ToolSet } from 'ai';
import { Platform } from 'react-native';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { DevicePermissions } from '@/backend/services/permissions';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { PermissionPreferenceKey } from '@/shared/data/preference';
import type { Assistant } from '@/shared/data/types/assistant';

import type { McpRuntimeService } from '../mcp';
import { registerBuiltinTools } from './adapters/aiSdk/builtin/registerBuiltinTools';
import {
  type ConfiguredPaintingModel,
  type PaintingToolDependencies,
  resolveConfiguredPaintingModel,
} from './painting';
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

export type ToolResolverDependencies = PaintingToolDependencies & {
  devicePermissions: Pick<DevicePermissions, 'getStatusForPreference'>;
  mcpRuntime: Pick<McpRuntimeService, 'getToolEntriesForAssistant'>;
  preference: Pick<PreferenceService, 'get'>;
  webSearch: WebSearchService;
};

export class ToolResolver {
  private readonly builtinRegistry = new ToolRegistry<ToolApplyScope>(reportToolRuntimeDiagnostic);

  constructor(private readonly deps: ToolResolverDependencies) {
    registerBuiltinTools(this.builtinRegistry, deps);
  }

  async resolveForRequest(input: {
    assistant: Assistant;
    contextWindow?: number;
    mcpToolIds?: readonly string[];
  }): Promise<{ deferredEntries: ToolEntry[]; hasMcpTools: boolean; tools: ToolSet | undefined }> {
    const [deviceAccess, mcpEntries, paintingModel] = await Promise.all([
      this.getDeviceAccess(),
      this.deps.mcpRuntime.getToolEntriesForAssistant(input.assistant, input.mcpToolIds),
      this.getConfiguredPaintingModel(),
    ]);
    const activeBuiltins = this.builtinRegistry.selectActive({
      assistant: input.assistant,
      deviceAccess,
      paintingModel,
      platform: Platform.OS,
    });

    const requestRegistry = new ToolRegistry<ToolApplyScope>(reportToolRuntimeDiagnostic);
    for (const entry of [...activeBuiltins, ...mcpEntries]) requestRegistry.register(entry);
    const tools = toToolSet(requestRegistry.getAll());
    return {
      ...applyDeferExposition(tools, requestRegistry, input.contextWindow),
      // MOBILE SYNC DIVERGENCE: desktop gates OVMS `/no_think` on selected MCP ids. Mobile uses
      // materialized entries so a missing or filtered tool cannot change the model prompt.
      hasMcpTools: mcpEntries.length > 0,
    };
  }

  private async getConfiguredPaintingModel(): Promise<ConfiguredPaintingModel | null> {
    try {
      return await resolveConfiguredPaintingModel(this.deps);
    } catch (error) {
      logger.warn('Drawing model lookup failed; disabling generate_image', { error });
      return null;
    }
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
}

function toToolSet(entries: readonly ToolEntry[]): ToolSet | undefined {
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((entry) => [entry.name, entry.tool]));
}
