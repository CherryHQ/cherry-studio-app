import 'tsx/cjs'

import packageJson from './package.json'

// Read version from environment variable (set during build) or fallback to package.json
const appVersion = packageJson.version

export default {
  expo: {
    name: 'Cherry Studio',
    slug: 'cherry-studio',
    version: appVersion,
    // orientation: 'portrait', 锁定竖屏
    orientation: 'default',
    icon: './src/assets/images/favicon.png',
    scheme: 'cherry-studio',
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
      bundleIdentifier: 'com.cherry-ai.cherry-studio-app',
      userInterfaceStyle: 'automatic',
      infoPlist: {
        LSApplicationQueriesSchemes: ['shortcuts'],
        NSSpeechRecognitionUsageDescription: 'Allow Cherry Studio App to use speech recognition for voice input.',
        NSBonjourServices: ['_cherrystudio._tcp', '_http._tcp'],
        NSLocalNetworkUsageDescription:
          'Cherry Studio needs to access the local network to discover and connect to desktop applications.'
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './src/assets/images/adaptive-icon.png',
        backgroundColor: '#F65D5D'
      },
      edgeToEdgeEnabled: true,
      package: 'com.cherry_ai.cherry_studio_app',
      userInterfaceStyle: 'automatic',
      predictiveBackGestureEnabled: false,
      permissions: ['android.permission.ACCESS_WIFI_STATE', 'android.permission.CHANGE_WIFI_MULTICAST_STATE']
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
            buildArchs: ['arm64-v8a'],
            usesCleartextTraffic: true
          }
        }
      ],
      [
        'expo-splash-screen',
        {
          image: './src/assets/images/ios-splash-icon.png',
          imageWidth: 144,
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
              image: './src/assets/images/ios-splash-icon.png',
              backgroundColor: '#ffffff',
              resizeMode: 'contain',
              dark: {
                image: './src/assets/images/ios-splash-icon.png',
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
          fonts: ['./src/assets/fonts/FiraCode-Regular.ttf']
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
        'expo-speech-recognition',
        {
          microphonePermission: 'Allow Cherry Studio App to use your microphone for voice input.',
          speechRecognitionPermission: 'Allow Cherry Studio App to use speech recognition.'
        }
      ],
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
