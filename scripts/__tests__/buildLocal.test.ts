import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

test.each([
  { args: ['--platform', 'android'], profile: ['--profile', 'development'], customPlugin: false },
  { args: ['--platform', 'ios', '-e', 'production'], profile: [], customPlugin: false },
  { args: ['--platform', 'android'], profile: ['--profile', 'development'], customPlugin: true },
  { args: ['-e', 'production'], profile: [], customPlugin: false, selected: 'ios' },
  { args: ['-e', 'production'], profile: [], customPlugin: false, selected: 'android' },
  { args: ['-e', 'production', '--non-interactive'], profile: [], customPlugin: false },
])(
  'uses project tools for $args (custom plugin: $customPlugin, selection: $selected)',
  ({ args, profile, customPlugin, selected }) => {
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
      if (selected) {
        const cli = join(directory, 'node_modules/eas-cli/build');
        mkdirSync(join(cli, 'commandUtils'), { recursive: true });
        writeFileSync(
          join(cli, 'commandUtils/flags.js'),
          'exports.isNonInteractiveByDefault = () => false;',
        );
        writeFileSync(
          join(cli, 'platform.js'),
          `exports.selectPlatformAsync = async () => '${selected}';`,
        );
      }
      if (selected === 'android') {
        const pkg = join(directory, 'node_modules/@siteed/sherpa-onnx.rn');
        mkdirSync(pkg, { recursive: true });
        writeFileSync(
          join(pkg, 'prepare-archive.js'),
          "module.exports = async () => '/verified/sherpa.zip';",
        );
      }
      writeFileSync(
        join(directory, 'node_modules/eas-cli/bin/run'),
        `const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const plugin = spawnSync(process.env.EAS_LOCAL_BUILD_PLUGIN_PATH, [], { encoding: 'utf8' });
writeFileSync(process.env.CHERRY_LAUNCHER_RESULT, JSON.stringify({
  args: process.argv.slice(2), plugin: plugin.stdout.trim(), pluginStatus: plugin.status,
  archive: process.env.SITEED_SHERPA_ONNX_ARCHIVE
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
      delete env.SITEED_SHERPA_ONNX_ARCHIVE;
      if (customPlugin) env.EAS_LOCAL_BUILD_PLUGIN_PATH = pluginPath;
      const result = spawnSync(
        process.execPath,
        ['--import', require.resolve('tsx'), wrapper, ...args],
        { cwd: directory, env, encoding: 'utf8', timeout: 10_000 },
      );
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toEqual({
        args: [
          'build',
          '--local',
          ...profile,
          ...args,
          ...(selected ? ['--platform', selected] : []),
        ],
        plugin: expectedPlugin,
        pluginStatus: 0,
        ...(selected === 'android' && { archive: '/verified/sherpa.zip' }),
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('a clean Sherpa install and Android production launcher share a verified archive', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cherry-sherpa-launcher-'));
  try {
    const pkg = join(directory, 'node_modules/@siteed/sherpa-onnx.rn');
    const cli = join(directory, 'node_modules/eas-cli/bin');
    mkdirSync(join(pkg, 'scripts'), { recursive: true });
    mkdirSync(cli, { recursive: true });
    const installed = dirname(require.resolve('@siteed/sherpa-onnx.rn/package.json'));
    const requireFromSherpa = createRequire(join(installed, 'package.json'));
    const AdmZip = requireFromSherpa('adm-zip');
    const zip = new AdmZip();
    for (const file of requireFromSherpa('./scripts/sherpa-prebuilt-contract').getRequiredFiles()) {
      zip.addFile(file, Buffer.from('fixture'));
    }
    const payload: Buffer = zip.toBuffer();
    for (const file of [
      'install.js',
      'scripts/prepare-archive.cjs',
      'scripts/sherpa-prebuilt-contract.js',
    ]) {
      copyFileSync(join(installed, file), join(pkg, file));
    }
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({
        sherpaOnnxVersion: '1.13.0',
        sherpaOnnxArchiveSha256: createHash('sha256').update(payload).digest('hex'),
        exports: { './prepare-archive': './scripts/prepare-archive.cjs' },
      }),
    );
    writeFileSync(
      join(cli, 'run'),
      "require('node:fs').appendFileSync('launches', process.env.SITEED_SHERPA_ONNX_ARCHIVE + '\\n');",
    );
    writeFileSync(
      join(directory, 'curl'),
      `#!/usr/bin/env node
const fs = require('node:fs');
if (!process.argv.includes('--speed-limit') || !process.argv.includes('--speed-time')) process.exit(2);
fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], Buffer.from(process.env.DOWNLOAD_BYTES, 'base64'));
fs.appendFileSync('downloads', 'x');
`,
      { mode: 0o755 },
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: 'true',
      XDG_CACHE_HOME: directory,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      NODE_PATH: dirname(dirname(installed)),
      EAS_LOCAL_BUILD_PLUGIN_PATH: 'unused',
    };
    delete env.SITEED_SHERPA_ONNX_ARCHIVE;
    const build = (bytes: Buffer) =>
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
          env: { ...env, DOWNLOAD_BYTES: bytes.toString('base64') },
        },
      );

    const launches = join(directory, 'launches');
    const badDownload = Buffer.from('bad download');
    expect(build(badDownload).status).toBe(1);
    expect(existsSync(launches)).toBe(false);
    const install = spawnSync(process.execPath, [join(pkg, 'install.js')], {
      cwd: directory,
      env: { ...env, DOWNLOAD_BYTES: payload.toString('base64') },
    });
    expect(install.status).toBe(0);
    expect(existsSync(join(pkg, 'prebuilt/android/arm64-v8a/libsherpa-onnx-jni.so'))).toBe(true);
    expect(build(badDownload).status).toBe(0);
    const archive = readFileSync(launches, 'utf8').trim();
    expect(readFileSync(archive)).toEqual(payload);
    expect(readFileSync(join(directory, 'downloads'), 'utf8')).toBe('xx');
    writeFileSync(archive, 'damaged cache');
    expect(build(payload).status).toBe(0);
    expect(readFileSync(archive)).toEqual(payload);
    expect(readFileSync(launches, 'utf8').trim().split('\n')).toEqual([archive, archive]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
