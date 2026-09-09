import { ConnectPluginSchema } from '../plugins';

it('accepts structurally valid future plugin identifiers and arbitrary credential field names', () => {
  const input = {
    pluginId: 'vendor.future-plugin',
    fields: { tenant: 'tenant', signingKey: 'secret' },
  };
  expect(ConnectPluginSchema.parse(input)).toEqual(input);
});

it('rejects malformed identifiers and legacy or extra top-level credential channels', () => {
  for (const pluginId of ['', 'Invalid Id', 'https://example.com', 'a'.repeat(129)]) {
    expect(ConnectPluginSchema.safeParse({ pluginId, fields: {} }).success).toBe(false);
  }
  expect(ConnectPluginSchema.safeParse({ pluginId: 'github', credential: 'secret' }).success).toBe(
    false,
  );
  expect(
    ConnectPluginSchema.safeParse({
      pluginId: 'github',
      fields: { token: 'secret' },
      credential: 'secret',
    }).success,
  ).toBe(false);
});
