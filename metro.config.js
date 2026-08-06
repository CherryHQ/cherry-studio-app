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
config = withStorybook(config);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/frontend/styles/global.css',
  dtsFile: './src/types/uniwind-types.d.ts',
});
