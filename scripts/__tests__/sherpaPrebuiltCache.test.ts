import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

type Hunk = { original: string[]; adds: boolean };

function patchedFiles(patch: string): Map<string, Hunk[]> {
  const files = new Map<string, Hunk[]>();
  for (const section of patch.split(/^(?=diff --git )/m)) {
    const header = /^diff --git a\/\S+ b\/(\S+)/.exec(section);
    if (!header || section.includes('\n--- /dev/null')) continue;
    const hunks = section
      .split(/^(?=@@ )/m)
      .slice(1)
      .map((hunk) => {
        const lines = hunk.split('\n').slice(1);
        return {
          adds: lines.some((line) => line.startsWith('+')),
          original: lines
            .filter((line) => line.startsWith(' ') || line.startsWith('-'))
            .map((line) => line.slice(1)),
        };
      });
    files.set(header[1], hunks);
  }
  return files;
}

function contains(source: string[], block: string[]): boolean {
  return source.some((_, start) => block.every((line, offset) => source[start + offset] === line));
}

describe('Sherpa prebuilt archive cache patch', () => {
  const packageName = '@siteed/sherpa-onnx.rn';
  const version = '1.3.1';
  const dependency = `${packageName}@${version}`;
  const patchPath = `patches/@siteed__sherpa-onnx.rn@${version}.patch`;
  const installedDir = dirname(require.resolve(`${packageName}/package.json`));

  test('pins the installed package, lockfile patch hash, and non-reapplication hunks', () => {
    const rootPkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const installedPkg = JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8')) as {
      version: string;
      sherpaOnnxVersion: string;
      sherpaOnnxArchiveSha256: string;
    };
    const patch = readFileSync(patchPath, 'utf8');
    const hash = createHash('sha256').update(patch).digest('hex');

    expect(rootPkg.dependencies[packageName]).toBe(version);
    expect(installedPkg.version).toBe(version);
    expect(installedPkg.sherpaOnnxVersion).toBe('1.13.0');
    expect(installedPkg.sherpaOnnxArchiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`'${dependency}': ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  '${dependency}': ${hash}\n`);

    const files = patchedFiles(patch);
    expect([...files.keys()]).toEqual(['package.json', 'install.js']);
    const reapplicable = [...files]
      .filter(([file, hunks]) => {
        if (!hunks.some((hunk) => hunk.adds)) return false;
        const source = readFileSync(join(installedDir, file), 'utf8').split('\n');
        return hunks.every((hunk) => contains(source, hunk.original));
      })
      .map(([file]) => file);
    expect(reapplicable).toEqual([]);
  });

  test('verifies downloads, caches verified bytes, skips network on clean installs, and replaces damaged cache files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cherry-sherpa-cache-'));
    try {
      const pkg = join(directory, 'pkg');
      const binDir = join(directory, 'bin');
      const cacheHome = join(directory, 'cache');
      const downloadsLog = join(directory, 'downloads');
      mkdirSync(join(pkg, 'scripts'), { recursive: true });
      mkdirSync(binDir, { recursive: true });

      const requireFromSherpa = createRequire(join(installedDir, 'package.json'));
      const AdmZip = requireFromSherpa('adm-zip') as new () => {
        addFile: (name: string, data: Buffer) => void;
        toBuffer: () => Buffer;
      };
      const contract = requireFromSherpa('./scripts/sherpa-prebuilt-contract') as {
        getRequiredFiles: () => string[];
      };
      const zip = new AdmZip();
      for (const file of contract.getRequiredFiles()) {
        zip.addFile(file, Buffer.from('fixture'));
      }
      const payload = zip.toBuffer();
      const payloadSha256 = createHash('sha256').update(payload).digest('hex');

      for (const file of ['install.js', 'scripts/sherpa-prebuilt-contract.js']) {
        copyFileSync(join(installedDir, file), join(pkg, file));
      }
      writeFileSync(
        join(pkg, 'package.json'),
        JSON.stringify({
          sherpaOnnxVersion: '1.13.0',
          sherpaOnnxArchiveSha256: payloadSha256,
        }),
      );
      writeFileSync(
        join(binDir, 'curl'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const valueOf = (flag) => args[args.indexOf(flag) + 1];
if (valueOf('--speed-limit') !== '1' || valueOf('--speed-time') !== '120' || valueOf('--retry') !== '3') {
  process.exit(2);
}
fs.writeFileSync(valueOf('--output'), Buffer.from(process.env.DOWNLOAD_BYTES, 'base64'));
fs.appendFileSync(process.env.DOWNLOAD_LOG, 'x');
`,
        { mode: 0o755 },
      );

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CI: 'true',
        XDG_CACHE_HOME: cacheHome,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        NODE_PATH: dirname(dirname(installedDir)),
        DOWNLOAD_LOG: downloadsLog,
      };
      delete env.SKIP_SHERPA_DOWNLOAD;
      delete env.SITEED_SHERPA_ONNX_REBUILD_ANDROID;
      delete env.SITEED_SHERPA_ONNX_ALLOW_MISSING_PREBUILTS;

      const runInstall = (bytes: Buffer) =>
        spawnSync(process.execPath, [join(pkg, 'install.js')], {
          cwd: directory,
          encoding: 'utf8',
          env: { ...env, DOWNLOAD_BYTES: bytes.toString('base64') },
        });

      const cacheDir = join(cacheHome, 'cherry-studio-app', 'sherpa-onnx');
      const cachedArchive = join(cacheDir, `sherpa-onnx-1.13.0-${payloadSha256}.zip`);
      const androidLib = join(pkg, 'prebuilt/android/arm64-v8a/libsherpa-onnx-jni.so');
      const iosLib = join(pkg, 'prebuilt/ios/device/libsherpa-onnx-c-api.a');

      const badDownload = Buffer.from('bad download');
      expect(runInstall(badDownload).status).toBe(1);
      expect(existsSync(cachedArchive)).toBe(false);
      expect(existsSync(androidLib)).toBe(false);
      expect(readdirSync(cacheDir).some((entry) => entry.startsWith('.download-'))).toBe(false);
      expect(readFileSync(downloadsLog, 'utf8')).toBe('x');

      const first = runInstall(payload);
      expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });
      expect(readFileSync(downloadsLog, 'utf8')).toBe('xx');
      expect(readFileSync(cachedArchive)).toEqual(payload);
      expect(existsSync(androidLib)).toBe(true);
      expect(existsSync(iosLib)).toBe(true);

      rmSync(join(pkg, 'prebuilt'), { recursive: true, force: true });
      const cacheHit = runInstall(badDownload);
      expect({ status: cacheHit.status, stderr: cacheHit.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      expect(readFileSync(downloadsLog, 'utf8')).toBe('xx');
      expect(existsSync(androidLib)).toBe(true);
      expect(existsSync(iosLib)).toBe(true);

      writeFileSync(cachedArchive, 'damaged cache');
      rmSync(join(pkg, 'prebuilt'), { recursive: true, force: true });
      const recovered = runInstall(payload);
      expect({ status: recovered.status, stderr: recovered.stderr }).toEqual({
        status: 0,
        stderr: '',
      });
      expect(readFileSync(downloadsLog, 'utf8')).toBe('xxx');
      expect(readFileSync(cachedArchive)).toEqual(payload);
      expect(existsSync(androidLib)).toBe(true);
      expect(existsSync(iosLib)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
