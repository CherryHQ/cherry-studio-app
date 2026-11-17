import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins are CommonJS.
const withCloudSigning = require('../withCloudSigning');

const mockInfoPlist = jest.fn();
const mockStringsXml = jest.fn();
jest.mock('expo/config-plugins', () => ({
  withInfoPlist: (...args: unknown[]) => {
    mockInfoPlist(...args);
    return args[0];
  },
  withStringsXml: (...args: unknown[]) => {
    mockStringsXml(...args);
    return args[0];
  },
  withDangerousMod: (config: unknown, [, action]: [string, (value: unknown) => Promise<unknown>]) =>
    action(config),
  AndroidConfig: {
    Strings: { setStringItem: (items: unknown) => ({ resources: { string: items } }) },
  },
}));

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv, CHERRYAI_CLIENT_SECRET: 'diagnostics-only' };
  delete process.env.CHERRY_CLOUD_CLIENT_SECRET;
  delete process.env.MAIN_VITE_CHERRY_CLOUD_CLIENT_SECRET;
});
afterEach(() => {
  process.env = originalEnv;
});

test.each([
  {
    name: 'mobile variable',
    primary: 'cloud-key-测试',
    desktop: undefined,
    expected: 'cloud-key-测试',
  },
  {
    name: 'desktop alias',
    primary: undefined,
    desktop: 'desktop-cloud-key',
    expected: 'desktop-cloud-key',
  },
  {
    name: 'mobile precedence',
    primary: 'mobile-cloud-key',
    desktop: 'desktop-cloud-key',
    expected: 'mobile-cloud-key',
  },
  { name: 'unconfigured Cloud', primary: undefined, desktop: undefined, expected: '' },
])(
  'provisions $name into native resources without using the diagnostics credential',
  async ({ primary, desktop, expected }) => {
    if (primary !== undefined) process.env.CHERRY_CLOUD_CLIENT_SECRET = primary;
    if (desktop !== undefined) process.env.MAIN_VITE_CHERRY_CLOUD_CLIENT_SECRET = desktop;
    const directory = await mkdtemp(path.join(tmpdir(), 'cherry-cloud-signing-'));
    try {
      const config = { extra: { existing: true }, modRequest: { platformProjectRoot: directory } };
      const result = await withCloudSigning(config);
      expect(result.extra).toEqual({ existing: true });
      const ios = mockInfoPlist.mock.calls[0][1]({ modResults: {} });
      expect(ios.modResults.CherryCloudClientSecret).toBe(expected);
      const android = mockStringsXml.mock.calls[0][1]({ modResults: {} });
      expect(android.modResults.resources.string).toEqual([
        { $: { name: 'cherry_cloud_client_secret', translatable: 'false' }, _: expected },
      ]);
      const resources = await readFile(
        path.join(directory, 'app/src/main/res/raw/cherry_cloud_signing_keep.xml'),
        'utf8',
      );
      expect(resources).toContain('tools:keep="@string/cherry_cloud_client_secret"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
