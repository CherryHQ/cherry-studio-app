import { ConnectPluginSchema } from '../plugins';

it('accepts structurally valid future plugin identifiers and arbitrary credential field names', () => {
  const input = {
    pluginId: 'vendor.future-plugin',
    authMethod: 'future-oauth',
    fields: { tenant: 'tenant', signingKey: 'secret' },
  };
  expect(ConnectPluginSchema.parse(input)).toEqual(input);
});

it('rejects malformed identifiers and legacy or extra top-level credential channels', () => {
  for (const pluginId of ['', 'Invalid Id', 'https://example.com', 'a'.repeat(129)]) {
    expect(
      ConnectPluginSchema.safeParse({ pluginId, authMethod: 'api_key', fields: {} }).success,
    ).toBe(false);
  }
  expect(
    ConnectPluginSchema.safeParse({
      pluginId: 'github',
      authMethod: 'personal_token',
      credential: 'secret',
    }).success,
  ).toBe(false);
  expect(
    ConnectPluginSchema.safeParse({
      pluginId: 'github',
      authMethod: 'personal_token',
      fields: { token: 'secret' },
      credential: 'secret',
    }).success,
  ).toBe(false);
});

it('requires an explicit method and a valid method identifier', () => {
  for (const authMethod of [undefined, '', 'Invalid method', 'a'.repeat(129)]) {
    expect(
      ConnectPluginSchema.safeParse({ pluginId: 'github', authMethod, fields: { token: 'secret' } })
        .success,
    ).toBe(false);
  }
});
