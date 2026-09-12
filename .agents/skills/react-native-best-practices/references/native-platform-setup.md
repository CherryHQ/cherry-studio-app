---
title: Platform Differences
impact: MEDIUM
tags: ios, android, xcode, gradle, cocoapods
---

# Skill: Platform Differences

Navigate iOS and Android tooling, dependency management, and build systems in React Native.

## Quick Reference

| Platform | IDE | Package Manager | Build System |
|----------|-----|-----------------|--------------|
| JavaScript | VS Code | npm/yarn/pnpm/bun | Metro |
| iOS | Xcode | CocoaPods | xcodebuild |
| Android | Android Studio | Gradle | Gradle |

```bash
# Common commands
bundle install                      # Install ruby bundler
cd ios && bundle exec pod install   # Install CocoaPods deps
cd android && ./gradlew tasks       # Verify Gradle wrapper and tasks
xed ios/                            # Open Xcode
```

## When to Use

- Setting up native development environment
- Adding native dependencies
- Debugging platform-specific issues
- Understanding build processes

## Dependency Management

React Native autolinking only handles libraries structured as React Native modules. React Native packages often ship native iOS/Android code through npm, then CocoaPods/Gradle reference local files from `node_modules`. Pure native dependencies still need Podfile or Gradle changes.

### JavaScript (npm/yarn/pnpm/bun)

Infer package manager from lockfile: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`.

### iOS (CocoaPods)

```bash
# Install pods after npm install
bundle install
cd ios && bundle exec pod install

# Key files
ios/Podfile           # Pod dependencies
ios/Pods/             # Installed pods (gitignored)
ios/*.xcworkspace     # Open this in Xcode (not .xcodeproj)
Gemfile               # Ruby/CocoaPods version
```


### Android (Gradle)

```bash
# Verify Gradle after adding dependencies
cd android && ./gradlew tasks

# Key files
android/build.gradle           # Project-level config
android/app/build.gradle       # App dependencies
android/gradle.properties      # Build flags
android/gradlew                # Gradle wrapper
```

Use exact Gradle dependency versions in production. Avoid dynamic `+` versions because they can change builds unpredictably.

## Common Commands

```bash
# iOS
bundle install                         # Install ruby bundler
cd ios && bundle exec pod install      # Install pods
xcrun simctl list                      # List simulators

# Android  
cd android && ./gradlew clean          # Clean build
./gradlew tasks                        # List available tasks
./gradlew assembleRelease              # Build release APK

# React Native CLI
npx react-native start                 # Start Metro
npx react-native run-ios               # Run on iOS
npx react-native run-android           # Run on Android

# Expo
npx expo start                         # Start Metro (Expo)
npx expo run:ios                       # Run on iOS (dev client)
npx expo run:android                   # Run on Android (dev client)
npx expo prebuild                      # Generate native projects
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pod install fails | `cd ios && bundle exec pod install --repo-update` |
| Xcode build fails | `cd ios && xcodebuild clean` |
| Android Gradle sync fails | Open Android Studio sync details, then run the failing Gradle task directly |
| Can't find simulator | `xcrun simctl list` to verify name |
| Metro cache issues | `npx react-native start --reset-cache` |
| React Native cache issues | Clear the specific cache reported by the failing tool |

## Related Skills

- [native-profiling.md](./native-profiling.md) - Use IDE profilers
- [native-turbo-modules.md](./native-turbo-modules.md) - Build native modules
- [upgrading-react-native.md](../../upgrading-react-native/references/upgrading-react-native.md) - Upgrade React Native safely
