import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginDefinition } from '../pluginDefinition';
import { createPluginRegistry } from '../pluginRegistry';

function definition(id: string): PluginDefinition {
  return {
    catalog: {
      id,
      name: { default: 'Future plugin', 'zh-cn': '未来插件' },
      summary: { default: 'Summary' },
      description: { default: 'Description' },
      access: { default: 'Access' },
      setup: { default: 'Setup' },
      credentialLinkLabel: { default: 'Get credentials' },
      icon: 'future-icon',
      links: {
        credentials: 'https://example.com/credentials',
        website: 'https://example.com',
        privacy: 'https://example.com/privacy',
      },
      credentialFields: [
        {
          id: 'tenantKey',
          label: { default: 'Tenant key' },
          error: { default: 'Invalid key' },
          secret: true,
          maxLength: 128,
        },
      ],
    },
    authMethod: 'future_credentials_v2',
    tools: { read: 'read', write: 'write' },
    encodeCredentials: (fields) => JSON.stringify({ version: 2, key: fields.tenantKey }),
    createClient: async () => {
      throw new Error('Not connected');
    },
    validation: { tool: 'read', accountLabel: () => 'Future account' },
  };
}

it('admits a fourth definition and derives its catalog and credential rules from one registration', () => {
  const registry = createPluginRegistry(
    ['one', 'two', 'three', 'vendor.future-plugin'].map(definition),
  );
  const plugin = registry.get('vendor.future-plugin')!;
  expect(registry.listCatalog().map((item) => item.id)).toContain('vendor.future-plugin');
  const fields = createPluginCredentialsSchema(plugin.catalog.credentialFields).parse({
    tenantKey: ' secret ',
  });
  expect(plugin.encodeCredentials(fields)).toBe('{"version":2,"key":"secret"}');
  expect(registry.get('unregistered')).toBeUndefined();
});

it('projects only detached public metadata, without executable or authorization configuration', () => {
  const registry = createPluginRegistry([definition('future')]);
  const catalog = registry.listCatalog();
  for (const key of ['authMethod', 'createClient', 'tools', 'encodeCredentials', 'validation'])
    expect(catalog[0]).not.toHaveProperty(key);
  expect(JSON.stringify(catalog)).not.toContain('future_credentials_v2');
  Object.assign(catalog[0].name, { default: 'Modified' });
  expect(registry.listCatalog()[0].name.default).toBe('Future plugin');
  expect(registry.get('future')!.catalog.name.default).toBe('Future plugin');
});

it('rejects duplicate identifiers and setup checks that invoke a write or unadmitted tool', () => {
  expect(() => createPluginRegistry([definition('future'), definition('future')])).toThrow(
    'Duplicate',
  );
  for (const tool of ['write', 'unadmitted']) {
    const plugin = definition('future');
    expect(() =>
      createPluginRegistry([{ ...plugin, validation: { ...plugin.validation, tool } }]),
    ).toThrow('read tool');
  }
});

it('rejects unsafe, repeated and malformed credential fields before exposing the catalog', () => {
  const plugin = definition('future');
  const field = plugin.catalog.credentialFields[0];
  for (const credentialFields of [
    [],
    [field, field],
    [{ ...field, id: '__proto__' }],
    [{ ...field, maxLength: 0 }],
    [{ ...field, pattern: '[' }],
  ]) {
    expect(() =>
      createPluginRegistry([{ ...plugin, catalog: { ...plugin.catalog, credentialFields } }]),
    ).toThrow();
  }
});
