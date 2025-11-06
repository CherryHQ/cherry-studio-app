module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': true
        }
      ]
    ],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      '@babel/plugin-transform-class-static-block',
      [
        'module-resolver',
        {
          alias: {
            '@db': './db'
          }
        }
      ],
      'react-native-worklets/plugin'
    ]
  }
}
