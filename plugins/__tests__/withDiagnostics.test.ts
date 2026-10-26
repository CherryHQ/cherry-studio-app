import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withDiagnostics = require('../withDiagnostics');

jest.mock('expo/config-plugins', () => ({
  withInfoPlist: (config: unknown) => config,
  withStringsXml: (config: unknown) => config,
  withDangerousMod: (config: unknown, [, action]: [string, (value: unknown) => Promise<unknown>]) =>
    action(config),
}));

test('retains the dynamically resolved diagnostics credential in optimized Android packages', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cherry-diagnostics-'));
  try {
    await withDiagnostics({ modRequest: { platformProjectRoot: directory } });
    const resources = await readFile(
      path.join(directory, 'app/src/main/res/raw/cherry_diagnostics_keep.xml'),
      'utf8',
    );
    expect(resources).toContain('xmlns:tools="http://schemas.android.com/tools"');
    expect(resources).toContain('tools:keep="@string/cherry_ai_client_secret"');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
