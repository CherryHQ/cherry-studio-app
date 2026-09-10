import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginAuthorizationDefinition, PluginDefinition } from '../pluginDefinition';
import { createPluginRegistry, resolveBuiltInPluginGuides } from '../pluginRegistry';

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
  const registry = createPluginRegistry([
    {
      ...definition('future'),
      guide: {
        revision: 1,
        sections: [
          { requiredTools: [], content: 'Intro.' },
          { requiredTools: ['write'], content: 'Write carefully.' },
        ],
      },
    },
  ]);
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
  expect(catalog.guide).toEqual({ revision: 1, content: 'Intro.\n\nWrite carefully.' });
  Object.assign(catalog.guide!, { revision: 99, content: 'Modified in the UI cache.' });
  expect(registry.listCatalog()[0].guide).toEqual({
    revision: 1,
    content: 'Intro.\n\nWrite carefully.',
  });
  expect(
    registry.resolveGuides([
      { pluginId: 'future', serverId: 'connection', rawToolName: 'read' },
    ])[0],
  ).toMatchObject({ revision: 1, content: 'Intro.' });
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

it('selects guides by registered identity and requires the complete workflow on one connection', () => {
  const registry = createPluginRegistry([
    {
      ...definition('future'),
      guide: {
        revision: 3,
        sections: [
          { requiredTools: [], content: '# Future\nRead or edit.' },
          { requiredTools: ['read'], content: 'Read workflow.' },
          { requiredTools: ['read', 'write'], content: 'Edit workflow.' },
        ],
      },
    },
    definition('without-guide'),
  ]);
  const snapshots = registry.resolveGuides([
    { pluginId: 'future', serverId: 'read-only', rawToolName: 'read' },
    { pluginId: 'future', serverId: 'read-only', rawToolName: 'read' },
    { pluginId: 'future', serverId: 'write-only', rawToolName: 'write' },
    { pluginId: 'future', serverId: 'complete', rawToolName: 'read' },
    { pluginId: 'future', serverId: 'complete', rawToolName: 'write' },
    { pluginId: 'future', serverId: 'unadmitted', rawToolName: 'other' },
    { pluginId: 'unknown', serverId: 'unknown', rawToolName: 'read' },
    { pluginId: 'without-guide', serverId: 'without-guide', rawToolName: 'read' },
    { serverId: 'custom-remote', rawToolName: 'read' },
  ]);
  expect(snapshots).toEqual([
    {
      pluginId: 'future',
      serverId: 'complete',
      revision: 3,
      content: '# Future\nRead or edit.\n\nRead workflow.\n\nEdit workflow.',
    },
    {
      pluginId: 'future',
      serverId: 'read-only',
      revision: 3,
      content: '# Future\nRead or edit.\n\nRead workflow.',
    },
    { pluginId: 'future', serverId: 'write-only', revision: 3, content: '# Future\nRead or edit.' },
  ]);
  expect(Object.isFrozen(snapshots)).toBe(true);
  expect(snapshots.every(Object.isFrozen)).toBe(true);
  expect(registry.resolveGuides([])).toEqual([]);
});

it('attributes an updated bundle without changing instructions already prepared for a turn', () => {
  const plugin = definition('future');
  const tools = [{ pluginId: 'future', serverId: 'connection', rawToolName: 'read' }];
  const previous = createPluginRegistry([
    {
      ...plugin,
      guide: { revision: 1, sections: [{ requiredTools: [], content: 'Original guide.' }] },
    },
  ]).resolveGuides(tools);
  const updated = createPluginRegistry([
    {
      ...plugin,
      guide: { revision: 2, sections: [{ requiredTools: [], content: 'Updated guide.' }] },
    },
  ]).resolveGuides(tools);
  expect(previous[0]).toMatchObject({ revision: 1, content: 'Original guide.' });
  expect(updated[0]).toMatchObject({ revision: 2, content: 'Updated guide.' });
});

it('rejects unadmitted guide prerequisites during registration', () => {
  expect(() =>
    createPluginRegistry([
      {
        ...definition('future'),
        guide: { revision: 1, sections: [{ requiredTools: ['missing'], content: 'Wrong tool.' }] },
      },
    ]),
  ).toThrow('unadmitted');
});

it('selects workflows for all three plugins without advertising unavailable Feishu writes', () => {
  const selection = (pluginId: string, rawToolName: string) => ({
    pluginId,
    serverId: `${pluginId}-connection`,
    rawToolName,
  });
  const guides = resolveBuiltInPluginGuides([
    selection('github', 'issue_read'),
    selection('amap', 'maps_direction_driving'),
    selection('feishu', 'fetch-doc'),
  ]);
  expect(guides.map(({ pluginId }) => pluginId)).toEqual(['amap', 'feishu', 'github']);
  expect(guides[0].content).toContain('## Driving directions');
  expect(guides[0].content).not.toContain('## Public transport');
  expect(guides[1].content).toContain('## Read a document');
  expect(guides[1].content).not.toContain('update-doc');
  expect(guides[1].content).not.toContain('create-doc');
  expect(guides[1].content).not.toContain('add-comments');
  expect(guides[2].content).toContain('## Read an issue');
  const [editable] = resolveBuiltInPluginGuides([
    selection('feishu', 'fetch-doc'),
    selection('feishu', 'update-doc'),
  ]);
  expect(editable.content).toContain('## Modify an existing document');
});

it('omits a guide when none of its workflows have their required tools', () => {
  const registry = createPluginRegistry([
    {
      ...definition('future'),
      guide: {
        revision: 1,
        sections: [{ requiredTools: ['read', 'write'], content: 'Edit workflow.' }],
      },
    },
  ]);
  expect(
    registry.resolveGuides([{ pluginId: 'future', serverId: 'connection', rawToolName: 'read' }]),
  ).toEqual([]);
});
