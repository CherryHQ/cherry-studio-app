const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

// Only UU performs screen streaming/PiP; Cherry just needs visibility for its deep link.
module.exports = (config) => {
  config = withInfoPlist(config, (mod) => {
    const schemes = (mod.modResults.LSApplicationQueriesSchemes ??= []);
    if (!schemes.includes('uuremote')) schemes.push('uuremote');
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const queries = (mod.modResults.manifest.queries ??= []);
    // A scheme-only query cannot match UU's entry, which requires the external host.
    const exists = queries.some((query) =>
      query.intent?.some(
        (intent) =>
          intent.action?.some(
            (action) => action.$['android:name'] === 'android.intent.action.VIEW',
          ) &&
          intent.data?.some((data) => data.$['android:scheme'] === 'uuremote') &&
          intent.data?.some((data) => data.$['android:host'] === 'external'),
      ),
    );
    if (!exists) {
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'uuremote', 'android:host': 'external' } }],
          },
        ],
      });
    }
    return mod;
  });
};
