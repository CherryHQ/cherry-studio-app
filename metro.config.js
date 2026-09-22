const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withStorybook } = require('@storybook/react-native/withStorybook');
const { withUniwindConfig } = require('uniwind/metro');

let config = getSentryExpoConfig(__dirname);

config.resolver.sourceExts.push('sql');
config.watchFolders.push(path.resolve(__dirname, 'packages'));

// libp2p packages pick their Node or browser entry through the legacy package.json `browser`
// file map, which Metro ignores once a package declares `exports`. Apply that map for relative
// imports inside those packages so the pure-JS entries win (node:os, node:crypto never bundle).
const legacyBrowserMapPackages = /\/node_modules\/(@libp2p|@chainsafe|@multiformats)\/[^/]+\//;
const browserRedirect = (context, moduleName) => {
  if (!moduleName.startsWith('.')) return null;
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
  const target = path.resolve(path.dirname(context.originModulePath), moduleName);
  const key = `./${path.relative(packageRoot, target)}`;
  const replacement = browser[key];
  return typeof replacement === 'string' ? path.join(packageRoot, replacement) : null;
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/frontend/styles/global.css',
  dtsFile: './src/types/uniwind-types.d.ts',
});
