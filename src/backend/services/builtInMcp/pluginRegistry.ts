import { PluginError } from '@/shared/contracts/plugins';
import {
  PluginIdSchema,
  type PluginCatalogEntry,
  type PluginCredentialField,
  type PluginId,
} from '@/shared/data/types/plugin';
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
    if (!plugin.authMethods.length) throw new Error(`Missing authorization methods: ${id}`);
    const methodIds = new Set<string>();
    for (const method of plugin.authMethods) {
      PluginIdSchema.parse(method.id);
      if (methodIds.has(method.id))
        throw new Error(`Duplicate authorization method: ${id}/${method.id}`);
      methodIds.add(method.id);
      if (method.kind === 'credentials') validateFields(id, method.fields);
      else {
        if (method.interaction !== 'polling' && method.interaction !== 'callback')
          throw new Error(`Invalid authorization interaction: ${id}/${method.id}`);
        if (!method.stages.length || new Set(method.stages).size !== method.stages.length)
          throw new Error(`Invalid authorization stages: ${id}/${method.id}`);
        for (const stage of method.stages) PluginIdSchema.parse(stage);
        if (method.applicationFields) validateFields(id, method.applicationFields);
      }
    }
    if (
      (plugin.validation.tool !== undefined && plugin.tools[plugin.validation.tool] !== 'read') ||
      (plugin.validation.args && !plugin.validation.tool)
    )
      throw new Error(`Plugin setup must use an admitted read tool: ${id}`);
    plugins.set(id, plugin);
  }
  return {
    get: (id: string) => plugins.get(id),
    listCatalog: (): PluginCatalogEntry[] =>
      // Return only a detached JSON projection; frontend caches cannot mutate executable definitions.
      Array.from(
        plugins.values(),
        ({ catalog, authMethods }) =>
          JSON.parse(
            JSON.stringify({
              ...catalog,
              authMethods: authMethods.map((method) =>
                method.kind === 'credentials'
                  ? {
                      id: method.id,
                      kind: method.kind,
                      fields: method.fields,
                      requiresDisconnect: method.requiresDisconnect,
                    }
                  : {
                      id: method.id,
                      kind: method.kind,
                      stages: method.stages,
                      interaction: method.interaction,
                      applicationFields: method.applicationFields,
                    },
              ),
            }),
          ) as PluginCatalogEntry,
      ),
  };
}

function validateFields(id: string, fields: readonly PluginCredentialField[]) {
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

export function requirePluginAuthMethod(plugin: PluginDefinition, id: string) {
  const method = plugin.authMethods.find((candidate) => candidate.id === id);
  if (!method)
    throw new PluginError(
      'unavailable',
      'This authorization method is unavailable in this app version.',
    );
  return method;
}

export function isBuiltInMcpToolAllowed(pluginId: PluginId, name: string): boolean {
  return getBuiltInMcpToolEffect(pluginId, name) !== undefined;
}

export function getBuiltInMcpToolEffect(
  pluginId: PluginId,
  name: string,
): 'read' | 'write' | undefined {
  const plugin = getPluginDefinition(pluginId);
  return plugin && Object.hasOwn(plugin.tools, name) ? plugin.tools[name] : undefined;
}
