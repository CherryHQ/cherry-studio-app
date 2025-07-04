export default {
  expo: {
    name: 'cherry-studio-app',
    slug: 'cherry-studio',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './src/assets/images/adaptive-icon.png',
    scheme: 'cherry-studio',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    entryPoint: './src/app.js',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.anonymous.cherrystudio'
    },
    android: {
      icon: './src/assets/images/adaptive-icon.png',
      adaptiveIcon: {
        foregroundImage: './src/assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff'
      },
      package: 'com.anonymous.cherrystudio'
    },
    web: {
      bundler: 'metro',
      // output: 'static',
      favicon: './src/assets/images/favicon.png'
    },
    plugins: [],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      eas: {
        projectId: '6ace903b-e144-4820-b968-54478056a48d'
      }
    }
  }
}
