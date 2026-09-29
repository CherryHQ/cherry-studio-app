import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { git, run, type Context } from './host';
import { saveState, type Artifact, type Platform, type State } from './state';

export const APP_IDS = {
  ios: 'com.cherryai.cherrystudio-app.dev',
  android: 'com.cherryai.cherrystudio_app.dev',
};

// Run in the source checkout so Expo resolves its own native dependencies/config.
// Only the digest leaves the process; config can contain private environment values.
export function fingerprint(source: string, platform: Platform): string {
  const script = `
    const {createRequire}=require('node:module');
    const {createHash}=require('node:crypto');
    const {readdirSync}=require('node:fs');
    const req=createRequire(process.cwd()+'/package.json');
    const fp=req('expo/fingerprint');
    const extraSources=[
      ...readdirSync('scripts').filter(n=>/^with.*\\.js$/.test(n)).map(n=>'scripts/'+n),
      'app.config.ts', 'eas.json', 'src/frontend/appShell/observability/reportingServices.json',
      'src/shared/utils/languages.ts'
    ].map(filePath=>({type:'file',filePath,reasons:['agent-native-contract']}));
    fp.createFingerprintAsync(process.cwd(),{
      platforms:[${JSON.stringify(platform)}],silent:true,concurrentIoLimit:4,
      sourceSkips:fp.SourceSkips.PackageJsonScriptsAll | fp.SourceSkips.GitIgnore,
      ignorePaths:['.context/**','.local/**','ios/**','android/**'],extraSources
    }).then(value=>console.log(createHash('sha256').update(JSON.stringify({
      version:1,expoFingerprint:value.hash,arch:process.arch,platform:${JSON.stringify(platform)},profile:'development'
    })).digest('hex'))).catch(error=>{console.error(error.message);process.exitCode=1});
  `;
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', '-e', script],
    {
      cwd: source,
      env: { ...process.env, PROFILE: 'development', CI: '1' },
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      'Native fingerprint failed. Check installed Expo dependencies and development config.',
    );
  const hash = result.stdout.trim().split('\n').at(-1)!;
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid native fingerprint output.');
  return hash;
}

export function baseline(ctx: Context, state: State, platform: Platform, source = ctx.root) {
  const commit = git(ctx.root, 'rev-parse', 'origin/main');
  if (
    git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir') !== ctx.common ||
    git(source, 'rev-parse', 'HEAD') !== commit ||
    git(source, 'status', '--porcelain').length
  )
    throw new Error(
      'A clean checkout at origin/main is required to refresh the shared native baseline. No checkout is changed automatically.',
    );
  state.baselines[platform] = { commit, fingerprint: fingerprint(source, platform), source };
  saveState(ctx.directory, state);
  return state.baselines[platform]!;
}

export function ensureBaseline(ctx: Context, state: State, platform: Platform) {
  // Config environment and resolved dependencies can change without a new commit.
  // Recompute from the explicit clean baseline source before classifying a branch.
  return baseline(ctx, state, platform, state.baselines[platform]?.source ?? ctx.root);
}

export async function checksum(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function artifactPath(ctx: Context, artifact: Artifact) {
  return join(ctx.directory, 'artifacts', artifact.key, artifact.file);
}
export async function verifyArtifact(ctx: Context, artifact: Artifact) {
  const file = artifactPath(ctx, artifact);
  if (!existsSync(file) || (await checksum(file)) !== artifact.checksum)
    throw new Error('Cached development artifact is missing or changed; build a replacement.');
  return file;
}

export async function build(ctx: Context, state: State, platform: Platform, source: string) {
  if (git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir') !== ctx.common)
    throw new Error('Build source must belong to this repository.');
  const before = fingerprint(source, platform);
  const existing = state.artifacts.findLast(
    (a) => a.platform === platform && a.fingerprint === before,
  );
  if (existing) {
    try {
      await verifyArtifact(ctx, existing);
      return existing;
    } catch {
      /* An explicit build repairs a missing/corrupt cache entry. */
    }
  }
  const temporary = join(ctx.directory, 'artifacts', `building-${randomUUID()}`);
  const stagingName = temporary.split('/').at(-1)!;
  state.staging.push(stagingName);
  saveState(ctx.directory, state);
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  const file = platform === 'ios' ? 'client.tar.gz' : 'client.apk';
  try {
    const lockFd = Number(process.env.CHERRY_AGENT_ENVIRONMENT_LOCK_FD);
    if (!Number.isInteger(lockFd) || lockFd < 3)
      throw new Error('Build must run through the locked agent:env command.');
    const result = spawnSync(
      'pnpm',
      [
        'build:local',
        '--platform',
        platform,
        '--profile',
        platform === 'ios' ? 'development-simulator' : 'development',
        '--output',
        join(temporary, file),
      ],
      {
        cwd: source,
        // Keep the kernel lock in pnpm while it waits for EAS. If the controller
        // exits, startup must not reclaim staging underneath an ongoing build.
        stdio: ['inherit', 'inherit', 'inherit', lockFd],
        env: { ...process.env, PROFILE: 'development' },
      },
    );
    if (result.status !== 0)
      throw new Error('Development build failed; no cache entry was published.');
    if (fingerprint(source, platform) !== before)
      throw new Error('Native inputs changed during the build; artifact was not published.');
    const digest = await checksum(join(temporary, file));
    const key = createHash('sha256').update(`${platform}:${before}:${digest}`).digest('hex');
    const artifact: Artifact = {
      key,
      platform,
      fingerprint: before,
      checksum: digest,
      file,
      createdAt: new Date().toISOString(),
    };
    const destination = join(ctx.directory, 'artifacts', key);
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    renameSync(temporary, destination);
    state.artifacts = state.artifacts.filter((a) => a.key !== key);
    state.artifacts.push(artifact);
    saveState(ctx.directory, state);
    return artifact;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    state.staging = state.staging.filter((name) => name !== stagingName);
    saveState(ctx.directory, state);
  }
}

export async function installPath(ctx: Context, artifact: Artifact) {
  const file = await verifyArtifact(ctx, artifact);
  if (artifact.platform === 'android') return file;
  const target = join(ctx.directory, 'artifacts', artifact.key, 'unpacked');
  // Only archives created and checksummed by build() enter this cache.
  if (!existsSync(target)) {
    const temporary = `${target}.partial`;
    rmSync(temporary, { force: true, recursive: true });
    mkdirSync(temporary, { mode: 0o700 });
    try {
      const entries = run('tar', ['-tf', file]).split('\n');
      if (entries.some((p) => p.startsWith('/') || p.split('/').includes('..')))
        throw new Error('Unsafe archive paths.');
      run('tar', ['-xf', file, '-C', temporary]);
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true, recursive: true });
    }
  }
  const apps = readdirSync(target).filter((name) => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one simulator .app at the artifact root.');
  return join(target, apps[0]);
}
