module.exports = {
  dependencies: {
    // Android owns task notifications here; iOS keeps its existing Live Activities.
    'react-native-background-actions': { platforms: { ios: null } },
    // Health is iOS-only; Android must not ship the Health Connect bridge or its permissions.
    'react-native-nitro-healthkit': { platforms: { android: null } },
  },
};
