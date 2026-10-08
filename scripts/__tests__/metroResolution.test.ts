import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

jest.mock('@sentry/react-native/metro', () => ({
  getSentryExpoConfig: () => ({ resolver: { sourceExts: [] }, watchFolders: [] }),
}));
jest.mock('react-native-worklets/bundleMode', () => ({
  getBundleModeMetroConfig: (config: unknown) => config,
}));
jest.mock('@storybook/react-native/withStorybook', () => ({
  withStorybook: (config: unknown) => config,
}));
jest.mock('uniwind/metro', () => ({ withUniwindConfig: (config: unknown) => config }));

type Context = {
  originModulePath: string;
  resolveRequest: (
    context: Context,
    moduleName: string,
    platform: string,
  ) => {
    type: 'sourceFile';
    filePath: string;
  };
};
const config = jest.requireActual<{
  resolver: { resolveRequest: Context['resolveRequest'] };
}>('../../metro.config.js');
const projectOrigin = join(process.cwd(), 'package.json');
// Jest maps every Expo import to the root copy. Use Node's physical resolution
// in a subprocess so this regression does not pass because of that test-only map.
function resolveFrom(origin: string, moduleName: string) {
  return execFileSync(
    process.execPath,
    [
      '-e',
      "const {createRequire}=require('node:module'); process.stdout.write(createRequire(process.argv[1]).resolve(process.argv[2]));",
      origin,
      moduleName,
    ],
    { encoding: 'utf8' },
  );
}

it.each(['ios', 'android', 'web'])(
  'resolves Expo runtime and HMR subpaths from the project on %s',
  (platform) => {
    // The real peer-resolved @expo/ui dependency can resolve a different physical
    // Expo copy. Both imports must still select the one native startup initializes.
    const context: Context = {
      originModulePath: resolveFrom(join(process.cwd(), 'packages/ui/package.json'), '@expo/ui'),
      resolveRequest: (origin, moduleName) => ({
        type: 'sourceFile',
        filePath: resolveFrom(origin.originModulePath, moduleName),
      }),
    };
    for (const moduleName of ['expo', 'expo/src/async-require/hmr.ts']) {
      const result = config.resolver.resolveRequest(context, moduleName, platform);
      expect(result.filePath).toBe(resolveFrom(projectOrigin, moduleName));
    }
  },
);
it('preserves the requesting package context for ordinary dependencies', () => {
  const resolveRequest = jest.fn(() => ({ type: 'sourceFile' as const, filePath: '/native.js' }));
  const context = { originModulePath: '/package/index.js', resolveRequest };
  expect(config.resolver.resolveRequest(context, 'react-native', 'ios').filePath).toBe(
    '/native.js',
  );
  expect(resolveRequest).toHaveBeenCalledWith(context, 'react-native', 'ios');
});
