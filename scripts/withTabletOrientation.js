const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RESOURCE_NAME = 'cherry_screen_orientation';

// Android resolves the orientation resource for the device. Keep phone portrait
// behavior while allowing tablet rotation without a JS-driven orientation lock.
module.exports = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:screenOrientation'] = `@integer/${RESOURCE_NAME}`;
    activity.$['android:resizeableActivity'] = 'true';
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
