import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

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
      const wrapper = resolve('scripts/buildLocal.ts');
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

test('Android production starts EAS only after preparing a verified Sherpa archive', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cherry-sherpa-launcher-'));
  try {
    const pkg = join(directory, 'node_modules/@siteed/sherpa-onnx.rn');
    const cli = join(directory, 'node_modules/eas-cli/bin');
    mkdirSync(join(pkg, 'scripts'), { recursive: true });
    mkdirSync(cli, { recursive: true });
    const payload = 'verified native libraries';
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        sherpaOnnxVersion: '1.13.0',
        sherpaOnnxArchiveSha256: createHash('sha256').update(payload).digest('hex'),
      }),
    );
    writeFileSync(
      join(pkg, 'scripts/sherpa-prebuilt-contract.js'),
      "exports.releaseAssetUrl = () => 'https://example.invalid/sherpa.zip';",
    );
    writeFileSync(
      join(cli, 'run'),
      "require('node:fs').appendFileSync('launches', process.env.SITEED_SHERPA_ONNX_ARCHIVE + '\\n');",
    );
    writeFileSync(
      join(directory, 'curl'),
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], process.env.DOWNLOAD_BYTES);
fs.appendFileSync('downloads', 'x');
`,
      { mode: 0o755 },
    );
    const build = (bytes: string) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          require.resolve('tsx'),
          resolve('scripts/buildLocal.ts'),
          '-p',
          'android',
          '-e',
          'production',
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_CACHE_HOME: directory,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
            DOWNLOAD_BYTES: bytes,
            EAS_LOCAL_BUILD_PLUGIN_PATH: 'unused',
          },
        },
      );

    const launches = join(directory, 'launches');
    expect(build('bad download').status).toBe(1);
    expect(existsSync(launches)).toBe(false);
    expect(build(payload).status).toBe(0);
    const archive = readFileSync(launches, 'utf8').trim();
    expect(readFileSync(archive, 'utf8')).toBe(payload);
    expect(build('network should be unused').status).toBe(0);
    expect(readFileSync(join(directory, 'downloads'), 'utf8')).toBe('xx');
    writeFileSync(archive, 'damaged cache');
    expect(build(payload).status).toBe(0);
    expect(readFileSync(archive, 'utf8')).toBe(payload);
    expect(readFileSync(launches, 'utf8').trim().split('\n')).toEqual([archive, archive, archive]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
