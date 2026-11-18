import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
