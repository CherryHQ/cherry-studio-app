import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

test.each([
  { args: ['--platform', 'android'], profile: ['--profile', 'development'], customPlugin: false },
  { args: ['--platform', 'ios', '-e', 'production'], profile: [], customPlugin: false },
  { args: ['--platform', 'android'], profile: ['--profile', 'development'], customPlugin: true },
])(
  'uses project tools for $args (custom plugin: $customPlugin)',
  ({ args, profile, customPlugin }) => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-build-launcher-'));
    try {
      const resultFile = join(directory, 'result.json');
      const globalBin = join(directory, 'global-bin');
      mkdirSync(globalBin);
      // A global eas must never run, even when it is the first executable on PATH.
      writeFileSync(join(globalBin, 'eas'), '#!/usr/bin/env node\nprocess.exit(99);\n', {
        mode: 0o755,
      });
      for (const name of ['eas-cli', 'eas-cli-local-build-plugin']) {
        const root = join(directory, 'node_modules', name);
        mkdirSync(join(root, 'bin'), { recursive: true });
        writeFileSync(join(root, 'package.json'), JSON.stringify({ name }));
      }
      writeFileSync(
        join(directory, 'node_modules/eas-cli/bin/run'),
        `const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const plugin = spawnSync(process.env.EAS_LOCAL_BUILD_PLUGIN_PATH, [], { encoding: 'utf8' });
writeFileSync(process.env.CHERRY_LAUNCHER_RESULT, JSON.stringify({
  args: process.argv.slice(2), plugin: plugin.stdout.trim(), pluginStatus: plugin.status
}));
process.exit(plugin.status ?? 1);
`,
      );
      const pluginPath = customPlugin
        ? join(directory, 'custom-plugin')
        : join(directory, 'node_modules/eas-cli-local-build-plugin/bin/run');
      const expectedPlugin = customPlugin ? 'custom-plugin' : 'project-plugin';
      writeFileSync(pluginPath, `#!/usr/bin/env node\nconsole.log('${expectedPlugin}');\n`, {
        mode: 0o755,
      });
      const wrapper = join(directory, 'buildLocal.ts');
      copyFileSync(resolve('scripts/buildLocal.ts'), wrapper);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${globalBin}${delimiter}${process.env.PATH}`,
        CHERRY_LAUNCHER_RESULT: resultFile,
        // npm exec used to make nested npx select the outer CLI package as its executable source.
        npm_config_package: 'eas-cli@22.2.0',
      };
      delete env.EAS_LOCAL_BUILD_PLUGIN_PATH;
      if (customPlugin) env.EAS_LOCAL_BUILD_PLUGIN_PATH = pluginPath;
      const result = spawnSync(
        process.execPath,
        ['--import', require.resolve('tsx'), wrapper, ...args],
        { cwd: directory, env, encoding: 'utf8', timeout: 10_000 },
      );
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toEqual({
        args: ['build', '--local', ...profile, ...args],
        plugin: expectedPlugin,
        pluginStatus: 0,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('local production iOS keeps the IPA output when debug symbols are present', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cherry-build-artifacts-'));
  try {
    const output = join(directory, 'app.ipa');
    const original = join(directory, 'original.ipa');
    const symbols = join(directory, 'ios/build/CherryStudio.app.dSYM.zip');
    mkdirSync(dirname(symbols), { recursive: true });
    writeFileSync(original, 'original IPA fixture');
    writeFileSync(symbols, 'original dSYM fixture');

    const requireFromEas = createRequire(require.resolve('eas-cli/package.json'));
    const requireFromPlugin = createRequire(
      require.resolve('eas-cli-local-build-plugin/package.json'),
    );
    const easJsonRoot = dirname(requireFromEas.resolve('@expo/eas-json/package.json'));
    const buildToolsRoot = dirname(requireFromPlugin.resolve('@expo/build-tools/package.json'));
    // Use the pinned tools' actual artifact collector and saver without invoking native builds.
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const [configFile, resolverFile, collectorFile, saverFile, directory] = process.argv.slice(1);
const { resolveBuildProfile } = require(resolverFile);
const { maybeFindAndUploadBuildArtifacts } = require(collectorFile);
const { prepareArtifacts } = require(saverFile);
(async () => {
  const profile = resolveBuildProfile({
    easJson: JSON.parse(readFileSync(configFile, 'utf8')),
    platform: 'ios',
    profileName: 'production',
  });
  await prepareArtifacts([join(directory, 'original.ipa')]);
  await maybeFindAndUploadBuildArtifacts({
    job: profile,
    getReactNativeProjectDirectory: () => directory,
    uploadArtifact: ({ artifact }) => prepareArtifacts(artifact.paths),
  }, { logger: { info() {}, error({ err }) { throw err; } } });
})().catch(error => { console.error(error); process.exitCode = 1; });
`,
        resolve('eas.json'),
        join(easJsonRoot, 'build/build/resolver.js'),
        join(buildToolsRoot, 'dist/utils/artifacts.js'),
        requireFromPlugin.resolve('./dist/artifacts.js'),
        directory,
      ],
      {
        env: {
          ...process.env,
          EAS_LOCAL_BUILD_WORKINGDIR: directory,
          EAS_LOCAL_BUILD_ARTIFACT_PATH: output,
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(readFileSync(output)).toEqual(readFileSync(original));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
