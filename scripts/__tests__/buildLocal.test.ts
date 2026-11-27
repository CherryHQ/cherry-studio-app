import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
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

test('keeps eas-cli and eas-cli-local-build-plugin aligned on @expo/eas-build-job', () => {
  const requireFromProject = createRequire(resolve('package.json'));
  const rootPkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const easCliPkg = requireFromProject('eas-cli/package.json') as {
    version: string;
    dependencies?: Record<string, string>;
  };
  const localPluginPkg = requireFromProject('eas-cli-local-build-plugin/package.json') as {
    version: string;
    dependencies?: Record<string, string>;
  };

  expect(easCliPkg.version).toBe(rootPkg.devDependencies?.['eas-cli']);
  expect(localPluginPkg.version).toBe(rootPkg.devDependencies?.['eas-cli-local-build-plugin']);
  expect(easCliPkg.dependencies?.['@expo/eas-build-job']).toBeTruthy();
  expect(localPluginPkg.dependencies?.['@expo/eas-build-job']).toBe(
    easCliPkg.dependencies?.['@expo/eas-build-job'],
  );
});

test('routes EAS CLI HTTPS requests through https_proxy on Node 24 without ERR_INVALID_PROTOCOL', async () => {
  const connectTargets: string[] = [];
  const server = createServer();
  server.on('connect', (req, socket) => {
    connectTargets.push(req.url ?? '');
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected loopback proxy server to bind to an IP port.');
    }

    const childScript = [
      "const { createRequire } = require('node:module');",
      "const { resolve } = require('node:path');",
      "const requireFromProject = createRequire(resolve('package.json'));",
      "const requireFromEas = createRequire(requireFromProject.resolve('eas-cli/package.json'));",
      "const fetchMod = requireFromEas('./build/fetch.js');",
      '(async () => {',
      '  let errorCode = null;',
      '  let errorMessage = null;',
      '  try {',
      "    await fetchMod.default('https://api.expo.dev/graphql', { method: 'POST' });",
      '  } catch (error) {',
      "    errorCode = error && typeof error === 'object' && 'code' in error ? error.code : null;",
      '    errorMessage = error instanceof Error ? error.message : String(error);',
      '  }',
      '  process.stdout.write(JSON.stringify({',
      '    hasAgent: Boolean(fetchMod.httpsProxyAgent),',
      '    errorCode,',
      '    errorMessage,',
      '  }));',
      '})();',
    ].join('\n');

    const childResult = await new Promise<{
      status: number | null;
      stdout: string;
      stderr: string;
    }>((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, ['-e', childScript], {
        cwd: process.cwd(),
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          https_proxy: `http://127.0.0.1:${address.port}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', rejectChild);
      child.once('close', (status) => {
        resolveChild({ status, stdout, stderr });
      });
    });

    expect({ status: childResult.status, stderr: childResult.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
    const parsed = JSON.parse(childResult.stdout) as {
      hasAgent: boolean;
      errorCode: string | null;
      errorMessage: string | null;
    };
    expect(parsed.hasAgent).toBe(true);
    expect(connectTargets).toEqual(['api.expo.dev:443']);
    expect(parsed.errorCode).not.toBe('ERR_INVALID_PROTOCOL');
    expect(parsed.errorMessage).not.toMatch(/Protocol "https:" not supported/i);
    expect(parsed.errorMessage).toContain('502');
  } finally {
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
    });
  }
});
