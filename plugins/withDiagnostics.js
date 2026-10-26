const fs = require('node:fs/promises');
const path = require('node:path');
const {
  withDangerousMod,
  withInfoPlist,
  withStringsXml,
  AndroidConfig,
} = require('expo/config-plugins');

// Same provisioned Cherry client secret and suffix as PC. Keep the build value
// out of Expo's public extra/OTA config; the native application owns signing.
module.exports = function withDiagnostics(config) {
  const secret =
    process.env.CHERRYAI_CLIENT_SECRET || process.env.MAIN_VITE_CHERRYAI_CLIENT_SECRET || '';
  config = withInfoPlist(config, (mod) => {
    mod.modResults.CherryAIClientSecret = secret;
    return mod;
  });
  config = withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'cherry_ai_client_secret', translatable: 'false' }, _: secret }],
      mod.modResults,
    );
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      // Diagnostics resolves this app-owned value by name from its library module.
      // Resource shrinking cannot infer that runtime lookup.
      const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(
        path.join(directory, 'cherry_diagnostics_keep.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@string/cherry_ai_client_secret" />\n',
      );
      return mod;
    },
  ]);
};
