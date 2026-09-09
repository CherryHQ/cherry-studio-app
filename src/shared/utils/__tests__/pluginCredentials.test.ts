import type { PluginCredentialField } from '@/shared/data/types/plugin';

import { createPluginCredentialsSchema } from '../pluginCredentials';

const fields: PluginCredentialField[] = [
  {
    id: 'tenant',
    label: { default: 'Tenant' },
    error: { default: 'Invalid tenant' },
    secret: false,
    maxLength: 20,
    pattern: '^tenant-[a-z]+$',
  },
  {
    id: 'signingKey',
    label: { default: 'Signing key' },
    error: { default: 'Invalid key' },
    secret: true,
    maxLength: 8,
  },
];

it('validates and normalizes fields supplied by a new plugin without a platform-specific schema', () => {
  expect(
    createPluginCredentialsSchema(fields).parse({
      tenant: ' tenant-cherry ',
      signingKey: ' secret ',
    }),
  ).toEqual({ tenant: 'tenant-cherry', signingKey: 'secret' });
});

it.each([
  { tenant: 'tenant-cherry' },
  { tenant: 'invalid', signingKey: 'secret' },
  { tenant: 'tenant-cherry', signingKey: 'too-long-secret' },
  { tenant: 'tenant-cherry', signingKey: ' ' },
  { tenant: 'tenant-cherry', signingKey: 'secret', unexpected: 'private' },
])('rejects missing, invalid or unrecognized plugin-owned fields: %j', (input) => {
  expect(createPluginCredentialsSchema(fields).safeParse(input).success).toBe(false);
});
