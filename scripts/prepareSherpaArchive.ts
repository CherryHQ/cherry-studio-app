import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

async function archiveSha256(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function prepareSherpaArchive(projectDir: string, env: NodeJS.ProcessEnv) {
  const requireFromProject = createRequire(resolve(projectDir, 'package.json'));
  const metadataPath = requireFromProject.resolve('@siteed/sherpa-onnx.rn/package.json');
  const { sherpaOnnxVersion: version, sherpaOnnxArchiveSha256: digest } =
    requireFromProject(metadataPath);
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(
      'Missing pinned Sherpa ONNX archive metadata. Run pnpm install --frozen-lockfile.',
    );
  }
  const cacheDir = resolve(
    env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'cherry-studio-app',
    'sherpa-onnx',
  );
  const archive = join(cacheDir, `sherpa-onnx-${version}-${digest}.zip`);
  if (existsSync(archive) && (await archiveSha256(archive)) === digest) {
    console.log(`Using verified Sherpa ONNX ${version} archive from the local cache.`);
    return archive;
  }

  const { releaseAssetUrl } = requireFromProject(
    join(dirname(metadataPath), 'scripts/sherpa-prebuilt-contract.js'),
  );
  await mkdir(cacheDir, { recursive: true });
  const stagingDir = await mkdtemp(join(cacheDir, '.download-'));
  const download = join(stagingDir, 'archive.zip');
  try {
    console.log(`Downloading Sherpa ONNX ${version} before starting EAS Build.`);
    const curl = spawn(
      'curl',
      [
        '--fail',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--retry',
        '3',
        '--connect-timeout',
        '20',
        '--output',
        download,
        releaseAssetUrl(version),
      ],
      { env, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    const [code, signal] = await once(curl, 'close');
    if (code !== 0) throw new Error(`Sherpa ONNX download failed (${signal ?? code}).`);
    if ((await archiveSha256(download)) !== digest) {
      throw new Error(`Sherpa ONNX ${version} archive SHA-256 mismatch.`);
    }
    await rename(download, archive);
    return archive;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}
