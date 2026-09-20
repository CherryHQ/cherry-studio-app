const { withPodfile, withSettingsGradle } = require('expo/config-plugins');
const services = require('../src/frontend/appShell/observability/reportingServices.json');

// Exclude automatic native senders before app startup, using Expo's autolinking options.
// Only rewrite the managed template call (or our own previous output); reject custom calls.
module.exports = (config) => {
  const reporting = config.extra?.reporting;
  const isProduction =
    reporting?.environment === 'production' && process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true';
  const excluded = Object.entries(services)
    .filter(
      ([name, service]) =>
        service.nativePackage &&
        !(isProduction && service.enabled && reporting?.services?.[name] === true),
    )
    .map(([, service]) => service.nativePackage);

  config = withPodfile(config, (mod) => {
    const call =
      /^([\t ]*)use_expo_modules!(?:\(exclude: \[[^\n]*\]\) # cherry-reporting)?[\t ]*$/m;
    if (!call.test(mod.modResults.contents)) {
      throw new Error('Reporting autolinking requires the managed use_expo_modules! Podfile call.');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      call,
      (_, indent) =>
        `${indent}use_expo_modules!${excluded.length ? `(exclude: ${JSON.stringify(excluded)}) # cherry-reporting` : ''}`,
    );
    return mod;
  });

  return withSettingsGradle(config, (mod) => {
    const call =
      /^(?:[\t ]*expoAutolinking\.exclude = [^\n]* \/\/ cherry-reporting\n)?([\t ]*)expoAutolinking\.useExpoModules\(\)[\t ]*$/m;
    if (mod.modResults.language !== 'groovy' || !call.test(mod.modResults.contents)) {
      throw new Error(
        'Reporting autolinking requires the managed expoAutolinking.useExpoModules() Gradle call.',
      );
    }
    mod.modResults.contents = mod.modResults.contents.replace(call, (_, indent) => {
      const exclusion = excluded.length
        ? `${indent}expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ${JSON.stringify(excluded)} // cherry-reporting\n`
        : '';
      return `${exclusion}${indent}expoAutolinking.useExpoModules()`;
    });
    return mod;
  });
};
