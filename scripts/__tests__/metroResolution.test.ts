import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

jest.mock('@sentry/react-native/metro', () => ({
  getSentryExpoConfig: () => ({ resolver: { sourceExts: [], assetExts: [] }, watchFolders: [] }),
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

it.each(['ios', 'android'])('resolves Pi Vertex to the Google web SDK on %s', (platform) => {
  const originModulePath = realpathSync(
    join(process.cwd(), 'node_modules/@earendil-works/pi-ai/dist/api/google-vertex.js'),
  );
  const context = {
    originModulePath,
    resolveRequest: () => {
      throw new Error('The native resolver cannot resolve @google/genai/web');
    },
  };
  const result = config.resolver.resolveRequest(context, '@google/genai/web', platform);
  // Resolve Pi's installed dependency, rather than assuming it is hoisted at the app root.
  const nodeEntry = resolveFrom(originModulePath, '@google/genai');
  expect(result).toEqual({
    type: 'sourceFile',
    filePath: realpathSync(join(dirname(nodeEntry), '../web/index.mjs')),
  });
});

it('preserves web platform resolution for the Google web SDK', () => {
  const resolveRequest = jest.fn(() => ({ type: 'sourceFile' as const, filePath: '/web.js' }));
  const context = { originModulePath: '/package/index.js', resolveRequest };
  expect(config.resolver.resolveRequest(context, '@google/genai/web', 'web').filePath).toBe(
    '/web.js',
  );
  expect(resolveRequest).toHaveBeenCalledWith(context, '@google/genai/web', 'web');
});

it.each(['ios', 'android'])(
  'keeps the Vertex SDK on its host-injected auth path on %s',
  (platform) => {
    const sdk = resolveFrom(projectOrigin, '@anthropic-ai/vertex-sdk/client');
    const resolveRequest = jest.fn(() => ({
      type: 'sourceFile' as const,
      filePath: '/node-auth.js',
    }));
    const context = { originModulePath: sdk, resolveRequest };
    const result = config.resolver.resolveRequest(context, 'google-auth-library', platform);
    expect(result.filePath).toBe(join(dirname(sdk), 'google-auth.native.js'));
    expect(resolveRequest).not.toHaveBeenCalled();
    const { GoogleAuth } = jest.requireActual<{ GoogleAuth: new () => unknown }>(result.filePath);
    expect(() => new GoogleAuth()).toThrow('host-provided authClient');
  },
);
