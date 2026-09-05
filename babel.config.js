module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must precede class-property transforms. Legacy mode matches the desktop
      // lifecycle decorators, which pass every argument explicitly and therefore
      // need neither the 2023-11 proposal nor emitDecoratorMetadata.
      ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
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
