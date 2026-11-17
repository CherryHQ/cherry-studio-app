const fs = require('node:fs/promises');
const path = require('node:path');
const {
  withDangerousMod,
  withInfoPlist,
  withStringsXml,
  AndroidConfig,
} = require('expo/config-plugins');

// The Cloud credential belongs to native signing, separately from CherryAI diagnostics.
module.exports = function withCloudSigning(config) {
  const secret =
    process.env.CHERRY_CLOUD_CLIENT_SECRET ||
    process.env.MAIN_VITE_CHERRY_CLOUD_CLIENT_SECRET ||
    '';
  config = withInfoPlist(config, (mod) => {
    mod.modResults.CherryCloudClientSecret = secret;
    return mod;
  });
  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'cherry_cloud_client_secret', translatable: 'false' }, _: secret }],
      mod.modResults,
    );
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(
        path.join(directory, 'cherry_cloud_signing_keep.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@string/cherry_cloud_client_secret" />\n',
      );
      return mod;
    },
  ]);
};
