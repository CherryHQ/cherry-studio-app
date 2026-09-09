import { PluginError } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginCatalogEntry } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginDefinition } from './pluginDefinition';
import { amapPlugin } from './plugins/amap';
import { feishuPlugin } from './plugins/feishu';
import { githubPlugin } from './plugins/github';

/** Registration is a bundled-code decision; there is no runtime installation or code loading. */
export function createPluginRegistry(definitions: readonly PluginDefinition[]) {
  const plugins = new Map<string, PluginDefinition>();
  for (const plugin of definitions) {
    const id = PluginIdSchema.parse(plugin.catalog.id);
    if (plugins.has(id)) throw new Error(`Duplicate plugin registration: ${id}`);
    if (!plugin.authMethod.trim()) throw new Error(`Missing authorization method: ${id}`);
    if (plugin.tools[plugin.validation.tool] !== 'read')
      throw new Error(`Plugin setup must use an admitted read tool: ${id}`);
    const fields = plugin.catalog.credentialFields;
    if (!fields.length || new Set(fields.map((field) => field.id)).size !== fields.length)
      throw new Error(`Invalid plugin credential fields: ${id}`);
    for (const field of fields) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field.id) ||
        ['constructor', 'prototype'].includes(field.id) ||
        !Number.isSafeInteger(field.maxLength) ||
        field.maxLength <= 0 ||
        field.maxLength > 16_384
      )
        throw new Error(`Invalid plugin credential field: ${id}`);
    }
    createPluginCredentialsSchema(fields);
    plugins.set(id, plugin);
  }
  return {
    get: (id: string) => plugins.get(id),
    listCatalog: (): PluginCatalogEntry[] =>
      // Return only a detached JSON projection; frontend caches cannot mutate executable definitions.
      Array.from(
        plugins.values(),
        ({ catalog }) => JSON.parse(JSON.stringify(catalog)) as PluginCatalogEntry,
      ),
  };
}

const registry = createPluginRegistry([githubPlugin, amapPlugin, feishuPlugin]);

export const getPluginDefinition = registry.get;
export const getBuiltInPluginCatalog = registry.listCatalog;

export function requirePluginDefinition(id: string): PluginDefinition {
  const plugin = registry.get(id);
  if (!plugin)
    throw new PluginError('unavailable', 'This plugin is not available in this app version.');
  return plugin;
}
