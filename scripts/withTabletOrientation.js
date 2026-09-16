const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require('expo/config-plugins');

const RESOURCE_NAME = 'cherry_screen_orientation';

// MainActivity resolves the device-specific resource at runtime: manifest
// resources cannot vary by screen size. Phones stay portrait; tablets can rotate.
module.exports = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:screenOrientation'] = 'unspecified';
    activity.$['android:resizeableActivity'] = 'true';
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('Tablet orientation requires the Kotlin MainActivity.');
    }
    const orientation = `requestedOrientation = resources.getInteger(R.integer.${RESOURCE_NAME})`;
    if (!mod.modResults.contents.includes(orientation)) {
      mod.modResults.contents = AndroidConfig.CodeMod.appendContentsInsideDeclarationBlock(
        mod.modResults.contents,
        'override fun onCreate',
        `    ${orientation}\n`,
      );
    }
    return mod;
  });

  return withDangerousMod(config, [
    'android',
    async (mod) => {
      // ActivityInfo constants: 1 is portrait; -1 lets the system choose.
      for (const [qualifier, orientation] of [
        ['values', 1],
        ['values-sw600dp', -1],
      ]) {
        const directory = path.join(
          mod.modRequest.platformProjectRoot,
          'app/src/main/res',
          qualifier,
        );
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(
          path.join(directory, 'cherry_screen_orientation.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <integer name="${RESOURCE_NAME}">${orientation}</integer>\n</resources>\n`,
        );
      }
      return mod;
    },
  ]);
};
