const { withInfoPlist, withStringsXml, AndroidConfig } = require('expo/config-plugins');

// Same provisioned Cherry client secret and suffix as PC. Keep the build value
// out of Expo's public extra/OTA config; the native application owns signing.
module.exports = function withDiagnostics(config) {
  const secret =
    process.env.CHERRYAI_CLIENT_SECRET || process.env.MAIN_VITE_CHERRYAI_CLIENT_SECRET || '';
  config = withInfoPlist(config, (mod) => {
    mod.modResults.CherryAIClientSecret = secret;
    return mod;
  });
  return withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'cherry_ai_client_secret', translatable: 'false' }, _: secret }],
      mod.modResults,
    );
    return mod;
  });
};
