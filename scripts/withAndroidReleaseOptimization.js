const { withAppBuildGradle } = require('expo/config-plugins');

// Registered before Sentry: Expo runs these mods in reverse order, so its Gradle block exists.
module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    const defaultRules = /getDefaultProguardFile\((['"])proguard-android(?:-optimize)?\.txt\1\)/g;
    if (mod.modResults.language !== 'groovy' || !defaultRules.test(mod.modResults.contents)) {
      throw new Error('Android release optimization requires the managed ProGuard Gradle call.');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      defaultRules,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );

    if (config.extra?.reporting?.services?.sentry) {
      const sentryBlock = /^[\t ]*sentry \{[\t ]*$/m;
      if (!sentryBlock.test(mod.modResults.contents)) {
        throw new Error('Android release optimization requires the Sentry Android Gradle plugin.');
      }
      if (!mod.modResults.contents.includes('additionalSourceDirsForSourceContext')) {
        // Local Expo modules are separate Gradle libraries, outside the app's source sets.
        mod.modResults.contents = mod.modResults.contents.replace(
          sentryBlock,
          `$&
      additionalSourceDirsForSourceContext = file("$rootDir/../modules").listFiles()
          .collect { new File(it, "android/src/main/java") }
          .findAll { it.isDirectory() }
          .collect { it.absolutePath }`,
        );
      }
    }
    return mod;
  });
