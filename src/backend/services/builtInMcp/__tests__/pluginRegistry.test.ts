import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginAuthorizationDefinition, PluginDefinition } from '../pluginDefinition';
import { createPluginRegistry } from '../pluginRegistry';

function credentialMethod(id = 'future_credentials_v2'): PluginAuthorizationDefinition {
  return {
    id,
    kind: 'credentials',
    fields: [{ id: 'tenantKey', secret: true, maxLength: 128 }],
    requiresDisconnect: true,
    encodeCredentials: (fields) => ({ version: 2, key: fields.tenantKey }),
    createRequestAuthorization: () => ({ apply() {} }),
  };
}
function definition(id: string): PluginDefinition {
  return {
    serverName: 'Future plugin',
    catalog: {
      id,
      icon: 'future-icon',
      links: {
        credentials: 'https://example.com/credentials',
        website: 'https://example.com',
        privacy: 'https://example.com/privacy',
      },
    },
    authMethods: [
      credentialMethod(),
      {
        id: 'future_oauth',
        kind: 'interactive',
        interaction: 'polling',
        stages: ['consent'],
        createRuntime: () => {
          throw new Error('Must not start from catalog reads');
        },
        createRequestAuthorization: () => ({ apply() {} }),
      },
    ],
    tools: { read: 'read', write: 'write' },
    createClient: async () => {
      throw new Error('Not connected');
    },
    validation: { tool: 'read', accountLabel: () => 'Future account' },
  };
}

it('registers another plugin with both credentials and OAuth without changing the catalog workflow', () => {
  const registry = createPluginRegistry(
    ['one', 'two', 'three', 'vendor.future-plugin'].map(definition),
  );
  const plugin = registry.get('vendor.future-plugin')!;
  expect(registry.listCatalog().map((item) => item.id)).toContain('vendor.future-plugin');
  const method = plugin.authMethods[0];
  if (method.kind !== 'credentials') throw new Error('Expected credential method');
  const fields = createPluginCredentialsSchema(method.fields).parse({ tenantKey: ' secret ' });
  expect(method.encodeCredentials(fields)).toEqual({ version: 2, key: 'secret' });
  expect(registry.listCatalog()[3].authMethods.map((item) => item.id)).toEqual([
    'future_credentials_v2',
    'future_oauth',
  ]);
  expect(registry.get('unregistered')).toBeUndefined();
});

it('projects detached method metadata while retaining all executable factories only in the backend', () => {
  const registry = createPluginRegistry([definition('future')]);
  const [catalog] = registry.listCatalog();
  for (const key of ['createClient', 'tools', 'validation', 'serverName'])
    expect(catalog).not.toHaveProperty(key);
  for (const method of catalog.authMethods) {
    for (const key of ['createRuntime', 'encodeCredentials', 'createRequestAuthorization'])
      expect(method).not.toHaveProperty(key);
  }
  expect(catalog.authMethods[0]).toMatchObject({ requiresDisconnect: true });
  expect(catalog.authMethods[1]).toMatchObject({ interaction: 'polling' });
  Object.assign(catalog.authMethods[1], { interaction: 'callback' });
  expect(registry.listCatalog()[0].authMethods[1]).toMatchObject({ interaction: 'polling' });
  Object.assign(catalog.links, { website: 'https://modified.example' });
  const method = catalog.authMethods[0];
  if (method.kind !== 'credentials') throw new Error('Expected credential method');
  Object.assign(method.fields[0], { maxLength: 1 });
  expect(registry.listCatalog()[0].links.website).toBe('https://example.com');
  expect(registry.get('future')!.authMethods[0]).toMatchObject({ fields: [{ maxLength: 128 }] });
});

it('rejects duplicate plugins, duplicate methods and setup checks that invoke a write or unadmitted tool', () => {
  const plugin = definition('future');
  expect(() => createPluginRegistry([plugin, plugin])).toThrow('Duplicate');
  expect(() =>
    createPluginRegistry([{ ...plugin, authMethods: [credentialMethod(), credentialMethod()] }]),
  ).toThrow('Duplicate authorization');
  expect(() => createPluginRegistry([{ ...plugin, authMethods: [] }])).toThrow('Missing');
  for (const tool of ['write', 'unadmitted'])
    expect(() =>
      createPluginRegistry([{ ...plugin, validation: { ...plugin.validation, tool } }]),
    ).toThrow('read tool');
});

it('rejects unsafe, repeated and malformed credential fields before exposing any form', () => {
  const plugin = definition('future');
  const method = plugin.authMethods[0];
  if (method.kind !== 'credentials') throw new Error('Expected credential method');
  const field = method.fields[0];
  for (const fields of [
    [],
    [field, field],
    [{ ...field, id: '__proto__' }],
    [{ ...field, maxLength: 0 }],
    [{ ...field, pattern: '[' }],
  ]) {
    expect(() =>
      createPluginRegistry([{ ...plugin, authMethods: [{ ...method, fields }] }]),
    ).toThrow();
  }
});
