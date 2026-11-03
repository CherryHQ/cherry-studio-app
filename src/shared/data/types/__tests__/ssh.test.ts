import { SshCommandInputSchema, SshFileRequestSchema, SshProfileFieldsSchema } from '../ssh';

const profile = {
  name: 'Project',
  host: 'server.example',
  port: 22,
  username: 'user',
  authMethod: 'password',
};

test('new profiles default to enabled and explicit disabled state survives validation', () => {
  expect(SshProfileFieldsSchema.parse(profile).isEnabled).toBe(true);
  expect(SshProfileFieldsSchema.parse({ ...profile, isEnabled: false }).isEnabled).toBe(false);
  expect(SshProfileFieldsSchema.safeParse({ ...profile, isEnabled: 'false' }).success).toBe(false);
});

test('preserves the account directory by default and accepts only an explicit absolute workspace root', () => {
  expect(SshProfileFieldsSchema.parse(profile).remoteDirectory).toBe('.');
  expect(
    SshProfileFieldsSchema.parse({ ...profile, remoteDirectory: '/srv/my project' })
      .remoteDirectory,
  ).toBe('/srv/my project');
  expect(
    SshProfileFieldsSchema.safeParse({ ...profile, remoteDirectory: '../project' }).success,
  ).toBe(false);
});

test('keeps command input verbatim and rejects NUL and over-limit payloads before execution', () => {
  const input = { command: 'cat', cwd: 'sub directory', stdin: 'line one\nline two\n' };
  expect(SshCommandInputSchema.parse(input)).toEqual(input);
  expect(SshCommandInputSchema.safeParse({ command: 'cat', stdin: 'secret\0suffix' }).success).toBe(
    false,
  );
  expect(
    SshCommandInputSchema.safeParse({ command: 'cat', stdin: 'x'.repeat(262145) }).success,
  ).toBe(false);
  expect(
    SshCommandInputSchema.safeParse({ command: 'pwd', password: 'not an input field' }).success,
  ).toBe(false);
});

test('requires explicit replacement intent for remote text writes', () => {
  const input = { operation: 'write', path: 'config.json', content: '{}' };
  expect(SshFileRequestSchema.safeParse(input).success).toBe(false);
  expect(SshFileRequestSchema.parse({ ...input, overwrite: false })).toMatchObject({
    overwrite: false,
  });
  expect(
    SshFileRequestSchema.safeParse({ ...input, overwrite: true, localPath: '/private/secret' })
      .success,
  ).toBe(false);
});
