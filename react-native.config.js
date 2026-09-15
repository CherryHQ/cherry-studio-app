module.exports = {
  dependencies: {
    // Android owns task notifications here; iOS keeps its existing Live Activities.
    'react-native-background-actions': { platforms: { ios: null } },
  },
};
