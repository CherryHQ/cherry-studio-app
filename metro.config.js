const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withStorybook } = require('@storybook/react-native/withStorybook');
const { withUniwindConfig } = require('uniwind/metro');

let config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');
config.watchFolders.push(path.resolve(__dirname, 'packages'));

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
