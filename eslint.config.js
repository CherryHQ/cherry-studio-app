const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // react-hooks/immutability is a React Compiler rule that doesn't understand
      // react-native-reanimated's SharedValue.value mutation pattern, which is the
      // idiomatic way to update shared values from worklets and gesture callbacks.
      'react-hooks/immutability': 'off',
    },
  },
]);
