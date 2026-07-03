module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      './babel-plugins/lucide-png-deep-import',
      ['inline-import', { extensions: ['.sql'] }],
      [
        'react-native-worklets/plugin',
        {
          bundleMode: true,
          importForwarding: { moduleNames: ['remend'] },
        },
      ],
    ],
  };
};
