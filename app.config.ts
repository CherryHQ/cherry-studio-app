import 'tsx/cjs'

import packageJson from './package.json'

// Read version from environment variable (set during build) or fallback to package.json
const appVersion = process.env.APP_VERSION || packageJson.version

// Determine if this is a production build
const isProduction = process.env.PROFILE === 'production'

// Configure app identity based on environment
const appName = isProduction ? 'Cherry Studio' : 'Cherry Studio Dev'
const appSlug = isProduction ? 'cherry-studio' : 'cherry-studio-dev'
const appScheme = isProduction ? 'cherry-studio' : 'cherry-studio-dev'
const iosBundleId = isProduction ? 'com.cherry-ai.cherry-studio' : 'com.cherry-ai.cherry-studio-dev'
const androidPackage = isProduction ? 'com.cherry_ai.cherry_studio' : 'com.cherry_ai.cherry_studio_dev'

export default {
  expo: {
    name: appName,
    slug: appSlug,
    version: appVersion,
    orientation: 'portrait',
    icon: './src/assets/images/favicon.png',
    scheme: appScheme,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    entryPoint: './src/app.js',
    updates: {
      url: 'https://u.expo.dev/80096eaf-3ad0-4b87-a466-15f04da1bacc'
    },
    runtimeVersion: {
      policy: 'appVersion'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: iosBundleId,
      userInterfaceStyle: 'automatic'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './src/assets/images/adaptive-icon.png',
        backgroundColor: '#F65D5D'
      },
      edgeToEdgeEnabled: true,
      package: androidPackage,
      userInterfaceStyle: 'automatic',
      predictiveBackGestureEnabled: false
    },
    plugins: [
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '15.5' },
          android: {
            buildToolsVersion: '35.0.0',
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
            gradleVersion: '8.13',
            androidGradlePluginVersion: '8.13.0',
            buildArchs: ['arm64-v8a']
          }
        }
      ],
      [
        'expo-splash-screen',
        {
          image: './src/assets/images/ios-splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './src/assets/images/ios-splash-icon.png',
            backgroundColor: '#000000'
          },
          ios: {
            splash: {
              image: './src/assets/images/ios-splash-icon.png',
              backgroundColor: '#ffffff',
              resizeMode: 'contain',
              dark: {
                image: './src/assets/images/ios-splash-icon.png',
                backgroundColor: '#000000'
              }
            }
          },
          android: {
            splash: {
              image: './src/assets/images/splash-icon.png',
              backgroundColor: '#ffffff',
              resizeMode: 'contain',
              dark: {
                image: './src/assets/images/splash-icon.png',
                backgroundColor: '#000000'
              }
            }
          }
        }
      ],
      'expo-localization',
      'expo-asset',
      [
        'expo-font',
        {
          fonts: ['./src/assets/fonts/JetBrainsMono-Regular.ttf']
        }
      ],
      'expo-web-browser',
      'expo-sqlite',
      [
        'expo-document-picker',
        {
          iCloudContainerEnvironment: 'Production'
        }
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'The app accesses your photos to let you share them with your friends.'
        }
      ],
      [
        'expo-camera',
        {
          cameraPermission: 'Allow Cherry Studio App to access your camera',
          // microphonePermission: 'Allow Cherry Studio App to access your microphone',
          recordAudioAndroid: true
        }
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'Allow Cherry Studio App to save images to your photo library.',
          savePhotosPermission: 'Allow Cherry Studio App to save images to your photo library.',
          isAccessMediaLocationEnabled: true
        }
      ],
      [
        'expo-calendar',
        {
          calendarPermission: 'Allow Cherry Studio App to access your calendar.',
          remindersPermission: 'Allow Cherry Studio App to access your reminders.'
        }
      ],
      ['react-native-compressor'],
      [
        'react-native-edge-to-edge',
        {
          android: {
            parentTheme: 'Material3',
            enforceNavigationBarContrast: false
          }
        }
      ],
      [
        'react-native-share',
        {
          ios: ['fb', 'instagram', 'twitter', 'tiktoksharesdk'],
          android: ['com.facebook.katana', 'com.instagram.android', 'com.twitter.android', 'com.zhiliaoapp.musically'],
          enableBase64ShareAndroid: true
        }
      ],
      './plugins/heapSize'
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      tsconfigPaths: true
    },
    extra: {
      eas: {
        projectId: '80096eaf-3ad0-4b87-a466-15f04da1bacc'
      },
      appVersion
    }
  }
}
