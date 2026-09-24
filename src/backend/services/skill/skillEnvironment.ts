/**
 * Reads the environment facts admission needs from their owners. Nothing is
 * cached across calls: permissions, provider configuration, and plugin
 * connections change outside Cherry, and a stale fact would admit a Skill the
 * user just made unusable.
 */

import { Platform } from 'react-native';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ModelService } from '@/backend/data/services/ModelService';
import {
  getBuiltInPluginCatalog,
  getPluginDefinition,
} from '@/backend/services/builtInMcp/pluginRegistry';
import type { PermissionsModule } from '@/shared/contracts/permissions';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { BUILT_IN_TOOL_DESCRIPTORS } from '@/shared/data/types/builtInTool';
import { isUniqueModelId } from '@/shared/data/types/model';
import type { PluginConnection } from '@/shared/data/types/plugin';

import type { SkillEnvironmentFacts } from './skillAdmission';

const logger = loggerService.withContext('SkillEnvironment');

export type SkillEnvironmentDependencies = {
  permissions: Pick<PermissionsModule, 'getStatuses'>;
  preference: Pick<PreferenceService, 'get'>;
  models: Pick<ModelService, 'getById'>;
  plugins: { listConnections(): Promise<PluginConnection[]> };
  platform?: string;
};

export type SkillEnvironmentReader = {
  read(): Promise<SkillEnvironmentFacts>;
  /** Static tool inventory of every bundled plugin, connected or not, for package analysis. */
  pluginToolCatalog(): ReadonlyMap<string, ReadonlySet<string>>;
};

export function createSkillEnvironmentReader(
  deps: SkillEnvironmentDependencies,
): SkillEnvironmentReader {
  const platform = deps.platform ?? Platform.OS;
  const scopes = [...new Set(BUILT_IN_TOOL_DESCRIPTORS.flatMap((d) => d.permissionScopes))];
  return {
    async read() {
      const [permissions, fetchProvider, searchProvider, paintingModelId, connections] =
        await Promise.all([
          deps.permissions.getStatuses(scopes).catch((error: unknown) => {
            logger.warn('Permission lookup failed; treating device scopes as blocked', { error });
            return {};
          }),
          deps.preference.get('chat.web_search.default_fetch_urls_provider').catch(() => null),
          deps.preference.get('chat.web_search.default_search_keywords_provider').catch(() => null),
          deps.preference.get('feature.paintings.default_model_id').catch(() => null),
          deps.plugins.listConnections().catch((error: unknown) => {
            logger.warn('Plugin connection lookup failed; treating plugins as disconnected', {
              error,
            });
            return [] as PluginConnection[];
          }),
        ]);
      const hasPaintingModel =
        isUniqueModelId(paintingModelId) &&
        (await deps.models.getById(paintingModelId).catch(() => null)) !== null;
      const pluginServerIds = new Map<string, Set<string>>();
      const connectedPlugins = new Map<string, ReadonlySet<string>>();
      for (const connection of connections) {
        if (connection.authorization && connection.authorization.status !== 'connected') continue;
        const ids = pluginServerIds.get(connection.pluginId) ?? new Set<string>();
        ids.add(connection.serverId);
        pluginServerIds.set(connection.pluginId, ids);
        const definition = getPluginDefinition(connection.pluginId);
        if (definition)
          connectedPlugins.set(connection.pluginId, new Set(Object.keys(definition.tools)));
      }
      return {
        platform,
        permissions,
        webSearchAvailability: {
          fetchUrls: Boolean(fetchProvider),
          searchKeywords: Boolean(searchProvider),
        },
        hasPaintingModel,
        connectedPlugins,
        pluginServerIds,
      };
    },
    pluginToolCatalog() {
      const catalog = new Map<string, ReadonlySet<string>>();
      for (const { id: pluginId } of getBuiltInPluginCatalog()) {
        const definition = getPluginDefinition(pluginId);
        if (definition) catalog.set(pluginId, new Set(Object.keys(definition.tools)));
      }
      return catalog;
    },
  };
}
