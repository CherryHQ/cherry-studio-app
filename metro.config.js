const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withStorybook } = require('@storybook/react-native/withStorybook');
const { withUniwindConfig } = require('uniwind/metro');

let config = getSentryExpoConfig(__dirname);

config.resolver.sourceExts.push('sql');
// The document preview page ships pdf.js CMaps and fonts as one byte-range asset.
config.resolver.assetExts.push('bin');
config.watchFolders.push(path.resolve(__dirname, 'packages'));

// libp2p packages pick their Node or browser entry through the legacy package.json `browser`
// file map, which Metro ignores once a package declares `exports`. Apply that map for relative
// imports inside those packages so the pure-JS entries win (node:os, node:crypto never bundle).
// Pi uses the same map to select its native manual OAuth callback adapter; Anthropic Vertex
// maps its Node Google auth dependency to a guard that requires host-injected credentials.
const legacyBrowserMapPackages =
  /\/node_modules\/(@libp2p|@chainsafe|@multiformats|@earendil-works|@anthropic-ai)\/[^/]+\//;
const browserRedirect = (context, moduleName) => {
  const match = legacyBrowserMapPackages.exec(context.originModulePath);
  if (!match) return null;
  const packageRoot = context.originModulePath.slice(0, match.index + match[0].length - 1);
  let browser;
  try {
    browser = require(path.join(packageRoot, 'package.json')).browser;
  } catch {
    return null;
  }
  if (typeof browser !== 'object' || browser === null) return null;
  const key = moduleName.startsWith('.')
    ? `./${path.relative(packageRoot, path.resolve(path.dirname(context.originModulePath), moduleName))}`
    : moduleName;
  const replacement = browser[key];
  return typeof replacement === 'string' ? path.join(packageRoot, replacement) : null;
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The nested web/package.json only declares `module`, which Metro's native main fields omit.
  // Resolve this explicit web entry through the parent package's exports instead.
  if (moduleName === '@google/genai/web' && (platform === 'android' || platform === 'ios')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [path.dirname(context.originModulePath)] }),
    };
  }
  // Native fetch has no browser CORS, and Hermes needs a validator without dynamic codegen.
  if (
    moduleName === '@modelcontextprotocol/client/_shims' &&
    (platform === 'android' || platform === 'ios')
  ) {
    return {
      type: 'sourceFile',
      filePath: path.join(
        path.dirname(require.resolve('@modelcontextprotocol/client')),
        'shimsWorkerd.mjs',
      ),
    };
  }
  // pnpm peer variants can give @expo/ui a second Expo runtime. Its Expo.fx
  // replaces __loadBundleAsync, but native startup initialized only the root
  // copy's HMR client. Keep Expo and its subpaths on that same runtime.
  if (moduleName === 'expo' || moduleName.startsWith('expo/')) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(__dirname, 'package.json') },
      moduleName,
      platform,
    );
  }
  if (platform === 'android' || platform === 'ios') {
    const redirected = browserRedirect(context, moduleName);
    if (redirected) return { type: 'sourceFile', filePath: redirected };
  }
  // pkce-challenge 5.x omits a native export; select the same browser entry as legacy resolution.
  if (moduleName === 'pkce-challenge' && (platform === 'android' || platform === 'ios')) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: [...context.unstable_conditionNames, 'browser'] },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Add .worklets directory to watch folders
const workletsDir = path.resolve(__dirname, 'node_modules/react-native-worklets/.worklets');
config.watchFolders.push(workletsDir);

// Apply Bundle Mode config
config = getBundleModeMetroConfig(config);
// Same flag `index.ts` branches on, so the bundle never carries Storybook when
// the entry did not select it. Defaults to enabled, which would ship the addons
// into the app bundle.
config = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
});

config = withUniwindConfig(config, {
  cssEntryFile: './src/frontend/styles/global.css',
  dtsFile: './src/types/uniwind-types.d.ts',
});

// Cached transforms can reference generated worklet files from a different EAS build directory.
if (process.env.EAS_BUILD === '1') {
  config.cacheStores = [];
}

module.exports = config;
