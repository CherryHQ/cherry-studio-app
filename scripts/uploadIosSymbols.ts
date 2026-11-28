import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { unzipSync } from 'fflate';

import {
  GateError,
  HOOK_DEADLINE_MS,
  PACKAGING_TIMEOUT_MS,
  PendingSymbolUpload,
  REQUIRED_IDENTIFIERS,
  TOOL_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  VERIFICATION_TIMEOUT_MS,
  WATCHDOG_GRACE_MS,
  checked,
  commandFailure,
  inspectDsymSlice,
  jsonFile,
  killActiveChildren,
  pairKey,
  queryDebugFiles,
  requireValue,
  requiredIosBundles,
  resolveSentryCli,
  retryPreflight,
  runCommand,
  sentryTargetFingerprint,
  sentryTargetFromEnv,
  uploadSymbolFiles,
  validUuid,
  waitForRemoteDebug,
  type ActiveContext,
  type BuildContext,
  type Bundle,
  type Dsym,
  type Observation,
  type Run,
  type UuidArch,
} from './release/iosSymbolShared';
import { fileEvidence, sanitizeDiagnostic } from './release/shared';
import { verifyPreparedSymbolPackage } from './verifyIosSymbolPackage';

export {
  FIRST_POLL_MS,
  GateError,
  HOOK_DEADLINE_MS,
  HTTP_TIMEOUT_MS,
  MAX_POLL_ROUNDS,
  MAX_QUERY_PAGES,
  PACKAGING_TIMEOUT_MS,
  PendingSymbolUpload,
  REQUIRED_IDENTIFIERS,
  TOOL_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  UUID_CONCURRENCY,
  VERIFICATION_TIMEOUT_MS,
  WATCHDOG_GRACE_MS,
  checked,
  hasQualifyingRecord,
  inspectDsymSlice,
  parseDsnProjectId,
  queryDebugFiles,
  requiredIosBundles,
  resolveSentryCli,
  retryPreflight,
  runCommand,
  sentryTargetFingerprint,
  sentryTargetFromEnv,
  uploadSymbolFiles,
  waitForRemoteDebug,
  type ActiveContext,
  type Bundle,
  type CommandResult,
  type Dsym,
  type RemoteDebugRecord,
  type Run,
  type UuidArch,
} from './release/iosSymbolShared';
export { fileEvidence, sanitizeDiagnostic } from './release/shared';

type VendorSymbol = {
  identifier: string;
  uuid?: string;
  arch?: string;
  coverage: 'missing' | 'limited' | 'debug-present' | 'uninspectable';
  upload?: 'submitted' | 'failed' | 'skipped';
};

let activeAttemptReceipt: string | undefined;
// Set once the attempt package is complete and Sentry work has started.
let activePendingMarker: { outDir: string; directory: string } | undefined;
const PENDING_MESSAGE =
  'Original symbols retained for retry. The submission gate requires Sentry verification for this build.';
function writePendingMarker({ outDir, directory }: { outDir: string; directory: string }) {
  writeJson(join(outDir, 'upload.pending'), { directory });
}

export function resolveBuildContext(env: NodeJS.ProcessEnv): BuildContext {
  if (env.EAS_BUILD_PLATFORM && env.EAS_BUILD_PLATFORM !== 'ios')
    return { kind: 'skip', reason: 'platform is not ios' };
  const localReleaseGate =
    env.EAS_BUILD_RUNNER === 'local-build-plugin' &&
    env.CHERRY_LOCAL_RELEASE_SYMBOL_GATE === 'true';
  if (env.EAS_BUILD_RUNNER === 'local-build-plugin' && !localReleaseGate)
    return { kind: 'skip', reason: 'local EAS build' };
  if (env.PROFILE && env.EAS_BUILD_PROFILE)
    requireValue(
      env.PROFILE.startsWith('production') === env.EAS_BUILD_PROFILE.startsWith('production'),
      'contradictory PROFILE and EAS_BUILD_PROFILE',
    );
  if (/^(development|preview)/.test(env.EAS_BUILD_PROFILE ?? ''))
    return { kind: 'skip', reason: 'development or preview build' };
  const claimed = Object.keys(env).some((key) => key.startsWith('EAS_BUILD'));
  if (!claimed) return { kind: 'skip', reason: 'not an EAS build' };
  const identity = validateBuildIdentity(env);
  const archivePath = resolve('ios/build/CherryStudio.xcarchive');
  requireValue(
    !env.GYM_ARCHIVE_PATH || resolve('ios', env.GYM_ARCHIVE_PATH) === archivePath,
    'GYM_ARCHIVE_PATH',
  );
  requireValue(
    existsSync(archivePath) && statSync(archivePath).isDirectory(),
    'archive path ios/build/CherryStudio.xcarchive',
  );
  const ipaPath = selectIpa(resolve('ios/build'));
  if (env.EAS_BUILD_ARTIFACT_PATH) {
    const resolvedArtifact = resolve(env.EAS_BUILD_ARTIFACT_PATH);
    const matchesArtifact =
      resolvedArtifact === ipaPath ||
      (localReleaseGate &&
        existsSync(resolvedArtifact) &&
        existsSync(ipaPath) &&
        realpathSync(resolvedArtifact) === realpathSync(ipaPath));
    requireValue(matchesArtifact, 'EAS_BUILD_ARTIFACT_PATH');
  }
  return {
    kind: 'active',
    env: { ...env },
    buildId: identity.buildId,
    sourceSha: identity.sourceSha,
    sentryUrl: '',
    org: '',
    project: '',
    token: env.SENTRY_AUTH_TOKEN ?? '',
    dsnProjectId: '',
    archivePath,
    ipaPath,
  };
}
function validateBuildIdentity(env: NodeJS.ProcessEnv) {
  const localReleaseGate =
    env.EAS_BUILD_RUNNER === 'local-build-plugin' &&
    env.CHERRY_LOCAL_RELEASE_SYMBOL_GATE === 'true';
  for (const [name, expected] of [
    ['EAS_BUILD_RUNNER', localReleaseGate ? 'local-build-plugin' : 'eas-build'],
    ['EAS_BUILD_PLATFORM', 'ios'],
    ['PROFILE', 'production'],
  ])
    requireValue(env[name] === expected, name);
  requireValue(env.EAS_BUILD_PROFILE?.startsWith('production'), 'EAS_BUILD_PROFILE');
  requireValue(env.EAS_BUILD === 'true' || env.EAS_BUILD === '1', 'EAS_BUILD');
  const buildId = (
    localReleaseGate
      ? (env.CHERRY_LOCAL_BUILD_ID ?? env.EAS_BUILD_ID ?? '')
      : (env.EAS_BUILD_ID ?? '')
  ).toLowerCase();
  requireValue(
    validUuid(buildId),
    localReleaseGate ? 'CHERRY_LOCAL_BUILD_ID (UUID)' : 'EAS_BUILD_ID (UUID)',
  );
  const sourceSha = (
    localReleaseGate
      ? (env.CHERRY_SOURCE_SHA ?? env.EAS_BUILD_GIT_COMMIT_HASH ?? '')
      : (env.EAS_BUILD_GIT_COMMIT_HASH ?? '')
  ).toLowerCase();
  requireValue(
    /^[a-f0-9]{40}$/i.test(sourceSha),
    localReleaseGate ? 'CHERRY_SOURCE_SHA (SHA)' : 'EAS_BUILD_GIT_COMMIT_HASH (SHA)',
  );
  return {
    runner: localReleaseGate ? ('local-build-plugin' as const) : ('eas-build' as const),
    buildId,
    sourceSha,
  };
}
export function validateBuildContext(ctx: ActiveContext) {
  if (!ctx.env) {
    if (!ctx.token.trim()) throw new GateError('SENTRY_TOKEN_MISSING', 'Missing SENTRY_AUTH_TOKEN');
    requireValue(/^[0-9]{1,20}$/.test(ctx.dsnProjectId), 'DSN project ID');
    return;
  }
  const env = ctx.env;
  validateBuildIdentity(env);
  if (!env.SENTRY_AUTH_TOKEN?.trim())
    throw new GateError('SENTRY_TOKEN_MISSING', 'Missing SENTRY_AUTH_TOKEN');
  if (!env.EXPO_PUBLIC_SENTRY_DSN?.trim())
    throw new GateError('SENTRY_DSN_MISSING', 'Missing EXPO_PUBLIC_SENTRY_DSN');
  requireValue(process.platform === 'darwin', 'macOS (darwin)');
  requireValue(
    env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true',
    'Sentry reporting (Storybook enabled)',
  );
  for (const name of [
    'SENTRY_ALLOW_FAILURE',
    'SENTRY_DISABLE_AUTO_UPLOAD',
    'SENTRY_DISABLE_XCODE_DEBUG_UPLOAD',
  ])
    requireValue(!env[name] || env[name] === 'false' || env[name] === '0', name);
  const services = jsonFile(resolve('src/frontend/appShell/observability/reportingServices.json'));
  requireValue(services.sentry?.enabled === true, 'Sentry reporting configuration');
  Object.assign(ctx, sentryTargetFromEnv(env));
}

function selectIpa(buildDir: string): string {
  const candidates = existsSync(buildDir)
    ? readdirSync(buildDir).filter(
        (name) => name.endsWith('.ipa') && statSync(join(buildDir, name)).isFile(),
      )
    : [];
  requireValue(candidates.length === 1, 'exactly one ios/build/*.ipa');
  return join(buildDir, candidates[0]);
}
export function parseUuidLines(text: string): UuidArch[] {
  const lines = text.trim().split(/\r?\n/);
  const uuids = lines.map((line) => {
    const match = /^UUID:\s+([a-f0-9-]+)\s+\(([a-zA-Z0-9_]+)\)\s+.+$/i.exec(line.trim());
    requireValue(match && validUuid(match[1]), 'dwarfdump UUID output');
    return { uuid: match[1].toLowerCase(), arch: match[2].toLowerCase() };
  });
  requireValue(
    new Set(uuids.map((pair) => pair.arch)).size === uuids.length,
    'unambiguous dwarfdump architecture',
  );
  return uuids;
}
export function walk(
  root: string,
  ancestors = new Set<string>(),
  checkDeadline: () => void = () => {},
): string[] {
  checkDeadline();
  requireValue(existsSync(root), `symbol input ${basename(root)}`);
  const real = realpathSync(root);
  if (ancestors.has(real))
    throw new GateError('INPUT_SYMLINK_CYCLE', `Cyclic symbol input: ${root}`);
  const parents = new Set([...ancestors, real]);
  return readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      checkDeadline();
      const path = join(root, entry.name);
      const stat = statSync(path);
      return stat.isDirectory()
        ? [path, ...walk(path, parents, checkDeadline)]
        : stat.isFile()
          ? [path]
          : [];
    });
}
async function discoverBundles(
  root: string,
  run: Run,
  checkDeadline: () => void = () => {},
): Promise<Bundle[]> {
  const bundles: Bundle[] = [];
  for (const path of walk(root, new Set(), checkDeadline).filter(
    (path) => /\.(app|appex|framework)$/i.test(path) && statSync(path).isDirectory(),
  )) {
    let identifier = relative(root, path);
    try {
      const plist = JSON.parse(
        await checked(run, 'plutil', ['-convert', 'json', '-o', '-', join(path, 'Info.plist')]),
      );
      if (typeof plist.CFBundleIdentifier === 'string') identifier = plist.CFBundleIdentifier;
      for (const key of ['CFBundleIdentifier', 'CFBundleExecutable'])
        requireValue(typeof plist[key] === 'string' && plist[key].trim(), `bundle plist ${key}`);
      requireValue(
        basename(plist.CFBundleExecutable) === plist.CFBundleExecutable &&
          !['.', '..'].includes(plist.CFBundleExecutable),
        'CFBundleExecutable path',
      );
      if (!/\.framework$/i.test(path))
        for (const key of ['CFBundleShortVersionString', 'CFBundleVersion'])
          requireValue(typeof plist[key] === 'string' && plist[key].trim(), `bundle plist ${key}`);
      const exePath = join(path, plist.CFBundleExecutable);
      if (!existsSync(exePath) || !statSync(exePath).isFile())
        throw new GateError(
          'IMAGE_INSPECTION',
          `Cannot inspect distributed image: ${relative(root, exePath)}`,
        );
      bundles.push({
        relPath: relative(root, path),
        identifier: plist.CFBundleIdentifier,
        executable: plist.CFBundleExecutable,
        version: plist.CFBundleShortVersionString ?? '',
        build: plist.CFBundleVersion ?? '',
        uuids: await inspectImage(exePath, run),
      });
    } catch (error) {
      if (error instanceof GateError && error.code === 'HOOK_DEADLINE') throw error;
      if (!REQUIRED_IDENTIFIERS.includes(identifier)) {
        bundles.push({
          relPath: relative(root, path),
          identifier,
          executable: basename(path),
          version: '',
          build: '',
          uuids: [],
        });
        continue;
      }
      throw new GateError(
        'IMAGE_INSPECTION',
        `Cannot inspect distributed image ${relative(root, path)}: ${error instanceof GateError ? error.message : 'invalid bundle metadata'}`,
      );
    }
  }
  const seen = new Set<string>();
  for (const exePath of walk(root, new Set(), checkDeadline).filter(
    (path) => /\.dylib$/i.test(path) && statSync(path).isFile(),
  )) {
    const real = realpathSync(exePath);
    if (seen.has(real)) continue;
    seen.add(real);
    bundles.push({
      relPath: relative(root, exePath),
      identifier: relative(root, exePath).replace(/^Payload\//, ''),
      executable: basename(exePath),
      version: '',
      build: '',
      uuids: await inspectImage(exePath, run).catch((error) => {
        if (error instanceof GateError && error.code === 'HOOK_DEADLINE') throw error;
        return [];
      }),
    });
  }
  return bundles;
}
async function inspectImage(path: string, run: Run) {
  try {
    return parseUuidLines(await checked(run, 'xcrun', ['dwarfdump', '--uuid', path]));
  } catch (error) {
    throw new GateError(
      'IMAGE_INSPECTION',
      `Cannot inspect distributed image ${path}: ${error instanceof GateError ? error.message : 'invalid Mach-O'}`,
    );
  }
}
export async function inventoryIpaBundles({
  ipaPath,
  workDir,
  run,
  checkDeadline = () => {},
}: {
  ipaPath: string;
  workDir: string;
  run: Run;
  checkDeadline?: () => void;
}) {
  requireValue(selectIpa(dirname(ipaPath)) === ipaPath, 'single selected IPA');
  const unpacked = join(workDir, 'unpacked-ipa');
  requireValue(!existsSync(unpacked), 'fresh IPA extraction directory');
  mkdirSync(unpacked, { recursive: true });
  await checked(run, 'ditto', ['-x', '-k', ipaPath, unpacked], PACKAGING_TIMEOUT_MS);
  const bundles = await discoverBundles(unpacked, run, checkDeadline);
  return { bundles, owned: requiredIosBundles(bundles) };
}
export async function inventoryDsyms({
  archivePath,
  run,
  cli = resolveSentryCli(),
  checkDeadline = () => {},
  required,
}: {
  required?: Bundle[];
  archivePath: string;
  run: Run;
  cli?: string;
  checkDeadline?: () => void;
}): Promise<Dsym[]> {
  const root = join(archivePath, 'dSYMs');
  const paths = walk(root, new Set(), checkDeadline).filter(
    (path) => /\.dSYM\/Contents\/Resources\/DWARF\/[^/]+$/.test(path) && statSync(path).isFile(),
  );
  requireValue(paths.length, 'archive dSYM DWARF files');
  const requiredPairs =
    required && new Set(required.flatMap((bundle) => bundle.uuids.map(pairKey)));
  const result: Dsym[] = [];
  for (const exePath of paths) {
    checkDeadline();
    let uuids: UuidArch[];
    try {
      uuids = parseUuidLines(await checked(run, 'xcrun', ['dwarfdump', '--uuid', exePath]));
    } catch (error) {
      if (!required || (error instanceof GateError && error.code === 'HOOK_DEADLINE')) throw error;
      // Unidentified files remain in the recovery zip. Coverage is decided from confirmed UUIDs.
      continue;
    }
    const slices: Dsym['slices'] = [];
    const scratch = mkdtempSync(join(tmpdir(), 'cherry-dsym-slices-'));
    try {
      for (const pair of uuids) {
        try {
          let path = exePath;
          if (uuids.length > 1) {
            path = join(scratch, pair.arch);
            await checked(run, 'xcrun', ['lipo', exePath, '-thin', pair.arch, '-output', path]);
          }
          slices.push({ ...pair, ...(await inspectDsymSlice(run, cli, path, pair)) });
        } catch (error) {
          if (
            !requiredPairs ||
            requiredPairs.has(pairKey(pair)) ||
            (error instanceof GateError && error.code === 'HOOK_DEADLINE')
          )
            throw error;
          slices.push({ ...pair, features: [], sourceLineBytes: null });
        }
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    result.push({
      relPath: relative(archivePath, exePath.slice(0, exePath.indexOf('.dSYM/') + 5)),
      exePath,
      uuids,
      slices,
    });
  }
  return result;
}
export function requireSymbolCoverage(ipaBundles: Bundle[], dsyms: Dsym[]) {
  const covered = new Set(
    dsyms.flatMap((dsym) =>
      dsym.slices.filter((slice) => (slice.sourceLineBytes ?? 0) > 0).map(pairKey),
    ),
  );
  for (const bundle of ipaBundles)
    for (const pair of bundle.uuids)
      if (!covered.has(pairKey(pair)))
        throw new GateError(
          'SYMBOL_COVERAGE',
          `Missing original full-debug dSYM for ${bundle.identifier} ${pairKey(pair)}`,
        );
}
function requireArchiveIdentity(ipa: Bundle[], archive: Bundle[]) {
  const identity = (bundle: Bundle) =>
    JSON.stringify([
      bundle.identifier,
      bundle.executable,
      bundle.version,
      bundle.build,
      bundle.uuids.map(pairKey).sort(),
    ]);
  requireValue(
    JSON.stringify(ipa.map(identity).sort()) === JSON.stringify(archive.map(identity).sort()),
    'archive bundle identities differ from IPA',
  );
}
function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
interface Status {
  status: 'pending' | 'passed' | 'failed';
  updatedAt: string;
}
interface Receipt {
  schemaVersion: 1;
  buildId: string;
  manifestSha256: string | null;
  createdAt: string;
  preflight: Status;
  upload: Status;
  remoteVerification: Status;
  cliExitStatus: number | null;
  failure: { stage: string; code: string; message?: string; observedAt: string } | null;
  records: Observation[];
  thirdPartySymbols: VendorSymbol[];
  identityUnverified?: 'project-scope' | 'client-key-scope';
  retention: { status: 'pending-post-build-check'; expiry: null; downloadVerified: false };
}
/** The marker is an atomic pointer to a fully prepared package directory. */
export function resolveSymbolPackage(outDir: string): string {
  const marker = jsonFile(join(outDir, 'package.complete'));
  requireValue(
    typeof marker.directory === 'string' && /^package-[A-Za-z0-9]+$/.test(marker.directory),
    'package.complete',
  );
  return join(outDir, marker.directory);
}
function initialReceipt(ctx: ActiveContext, outDir: string, timestamp: string): Receipt {
  mkdirSync(outDir, { recursive: true });
  const marker = join(outDir, 'package.complete');
  if (existsSync(marker)) {
    const path = join(resolveSymbolPackage(outDir), 'verification.json');
    const previous = jsonFile(path) as Receipt;
    requireValue(previous.buildId === ctx.buildId, 'leftover verification receipt build ID');
  }
  const receipt: Receipt = {
    schemaVersion: 1,
    buildId: ctx.buildId,
    manifestSha256: null,
    createdAt: timestamp,
    preflight: { status: 'pending', updatedAt: timestamp },
    upload: { status: 'pending', updatedAt: timestamp },
    remoteVerification: { status: 'pending', updatedAt: timestamp },
    cliExitStatus: null,
    failure: null,
    records: [],
    thirdPartySymbols: [],
    retention: { status: 'pending-post-build-check', expiry: null, downloadVerified: false },
  };
  return receipt;
}
export async function stageSymbols({
  archivePath,
  ipaPath,
  outDir,
  ipaBundles = [],
  dsyms = [],
  run,
  ctx,
  workDir,
  toolVersions = {},
  now = Date.now,
  checkDeadline = () => {},
  attemptDir,
  resolveCli = resolveSentryCli,
}: {
  archivePath: string;
  ipaPath: string;
  outDir: string;
  ipaBundles?: Bundle[];
  dsyms?: Dsym[];
  run: Run;
  ctx: ActiveContext;
  workDir: string;
  toolVersions?: Record<string, string>;
  now?: () => number;
  checkDeadline?: () => void;
  attemptDir?: string;
  resolveCli?: () => string;
}) {
  const receipt = initialReceipt(ctx, outDir, new Date(now()).toISOString());
  const pathRoot = process.cwd();
  const redactionEnv = {
    ...process.env,
    ...ctx.env,
    SENTRY_AUTH_TOKEN: ctx.token,
    EXPO_PUBLIC_SENTRY_DSN: ctx.dsn ?? ctx.env?.EXPO_PUBLIC_SENTRY_DSN,
  };
  const redact = (value: string) => sanitizeDiagnostic(value, redactionEnv);
  const lookupPath = (value: string) => {
    requireValue(
      value.length > 0 &&
        value.length <= 1024 &&
        // relative() can collapse scheme slashes; reject userinfo in either form.
        !/[\x00-\x1f\x7f-\x9f]|[a-z][a-z0-9+.-]*:\/{1,2}[^/\s]*@|[a-f0-9]{32,}/i.test(value) &&
        !value.startsWith('/') &&
        !value.includes('\\') &&
        !value.split('/').includes('..') &&
        redact(value) === value,
      'credential-free DWARF lookup path',
    );
    return value;
  };
  const stagedDsymsDir = join(workDir, 'upload', 'dSYMs');
  const draft = attemptDir ?? mkdtempSync(join(outDir, 'attempt-'));
  writeJson(join(draft, 'verification.json'), receipt);
  const temporaryZip = join(draft, 'dsyms.zip');
  checkDeadline();
  await cp(join(archivePath, 'dSYMs'), stagedDsymsDir, { recursive: true });
  checkDeadline();
  await checked(
    run,
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '--keepParent', join(archivePath, 'dSYMs'), temporaryZip],
    PACKAGING_TIMEOUT_MS,
  );
  // Check the ZIP against the retained originals before any publication, even if
  // tool discovery or the later inventory fails. A nonzero ditto exit is not the only failure mode.
  let zipped: Record<string, Uint8Array>;
  try {
    zipped = unzipSync(readFileSync(temporaryZip));
  } catch {
    throw new GateError('PACKAGE_ZIP_INVALID');
  }
  const originals = walk(stagedDsymsDir, new Set(), checkDeadline).filter((path) =>
    statSync(path).isFile(),
  );
  requireValue(originals.length > 0, 'original dSYM files');
  for (const original of originals) {
    checkDeadline();
    const bytes = zipped[`dSYMs/${relative(stagedDsymsDir, original)}`];
    const expected = await fileEvidence(original, checkDeadline);
    if (
      !bytes ||
      bytes.length !== expected.size ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )
      throw new GateError('PACKAGE_ZIP_CONTENTS');
  }
  checkDeadline();
  const temporaryInfo = join(draft, 'archive-info.plist');
  copyFileSync(join(archivePath, 'Info.plist'), temporaryInfo);

  async function completeManifest(
    ipaBundles: Bundle[],
    dsyms: Dsym[],
    toolVersions: Record<string, string>,
  ) {
    const replacement = draft;
    const main = ipaBundles.find((bundle) => bundle.identifier === REQUIRED_IDENTIFIERS[0]);
    const inspected = [];
    for (const dsym of dsyms) {
      checkDeadline();
      inspected.push({
        relPath: redact(relative(archivePath, resolve(archivePath, dsym.relPath))),
        dwarfPath: lookupPath(relative(archivePath, dsym.exePath)),
        uuids: dsym.uuids,
        slices: dsym.slices,
        ...(await fileEvidence(dsym.exePath, checkDeadline)),
        inspection: {
          tool: 'xcrun dwarfdump --uuid; sentry-cli debug-files check --json per slice',
          status: dsym.slices.every((slice) => slice.sourceLineBytes !== null)
            ? 'passed'
            : 'uninspectable',
        },
        matchingBundles: ipaBundles
          .filter((bundle) =>
            bundle.uuids.some((pair) =>
              dsym.uuids.some((candidate) => pairKey(candidate) === pairKey(pair)),
            ),
          )
          .map((bundle) => redact(bundle.identifier)),
      });
    }
    const manifest = {
      schemaVersion: 1,
      buildId: ctx.buildId,
      sourceSha: ctx.sourceSha,
      sentryTarget: sentryTargetFingerprint(ctx),
      runner:
        ctx.env?.EAS_BUILD_RUNNER === 'local-build-plugin' ? 'local-build-plugin' : 'eas-build',
      platform: 'ios',
      profile: redact(ctx.env?.EAS_BUILD_PROFILE ?? 'production'),
      createdAt: new Date(now()).toISOString(),
      toolVersions: Object.fromEntries(
        Object.entries(toolVersions).map(([key, value]) => [redact(key), redact(value)]),
      ),
      inventoryStatus: ipaBundles.length ? 'inspected' : 'pending',
      ipa: {
        path: redact(relative(pathRoot, ipaPath)),
        ...(await fileEvidence(ipaPath, checkDeadline)),
        version: main ? redact(main.version) : null,
        build: main ? redact(main.build) : null,
      },
      bundles: ipaBundles.map((bundle) => ({
        ...bundle,
        relPath: redact(relative(workDir, resolve(workDir, bundle.relPath))),
        identifier: redact(bundle.identifier),
        executable: redact(bundle.executable),
        version: redact(bundle.version),
        build: redact(bundle.build),
      })),
      dsyms: inspected,
      symbolPackage: {
        filename: 'dsyms.zip',
        ...(await fileEvidence(join(replacement, 'dsyms.zip'), checkDeadline)),
      },
      archive: {
        path: redact(relative(pathRoot, archivePath)),
        provenance:
          'original pinned EAS gym archive; see inventoryStatus and verification.json for identity checks',
        infoPlist: await fileEvidence(join(replacement, 'archive-info.plist'), checkDeadline),
      },
    };
    const manifestPath = join(replacement, 'manifest.json');
    // Sanitize untrusted metadata at its fields above. Generated size/SHA-256 evidence
    // and the validated source commit hash never pass through the text sanitizer.
    writeJson(manifestPath, manifest);
    const nextReceipt = {
      ...receipt,
      manifestSha256: (await fileEvidence(manifestPath, checkDeadline)).sha256,
    };
    writeJson(join(replacement, 'verification.json'), nextReceipt);
    // Validate all four files and the binding between manifest and receipt before publishing.
    for (const name of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
      requireValue(statSync(join(replacement, name)).size > 0, 'complete recovery package');
    requireValue(
      jsonFile(join(replacement, 'verification.json')).manifestSha256 ===
        (await fileEvidence(manifestPath, checkDeadline)).sha256,
      'manifest receipt checksum',
    );
    checkDeadline();
    Object.assign(receipt, nextReceipt);
  }
  await completeManifest(ipaBundles, dsyms, toolVersions);
  async function publish() {
    // The attempt remains recoverable even if validation or pointer publication fails.
    const replacement = mkdtempSync(join(outDir, 'package-'));
    for (const name of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
      copyFileSync(join(draft, name), join(replacement, name));
    await verifyPreparedSymbolPackage(replacement, ctx.buildId, run, resolveCli);
    checkDeadline();
    writeJson(join(outDir, 'package.complete'), { directory: basename(replacement) });
  }
  return { receipt, stagedDsymsDir, completeManifest, attemptDir: draft, publish };
}

export async function runUploadIosSymbols({
  ctx,
  run = runCommand,
  fetch: fetchImpl = fetch,
  now = Date.now,
  sleep,
  outDir = resolve('ios/build/ios-symbols'),
  resolveCli = resolveSentryCli,
  deadlineMs = now() + HOOK_DEADLINE_MS,
}: {
  ctx: BuildContext;
  run?: Run;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  outDir?: string;
  resolveCli?: () => string;
  deadlineMs?: number;
}) {
  if (ctx.kind === 'skip') return ctx;
  const hookDeadline = deadlineMs;
  const checkDeadline = () => {
    if (now() >= hookDeadline) throw new GateError('HOOK_DEADLINE');
  };
  const timestamp = () => new Date(now()).toISOString();
  let receipt = initialReceipt(ctx, outDir, timestamp());
  let executables = 0;
  let failure: GateError | undefined;
  let stage: 'preflight' | 'upload' | 'remoteVerification' = 'preflight';
  const attemptDir = mkdtempSync(join(outDir, 'attempt-'));
  const save = () => writeJson(join(attemptDir, 'verification.json'), receipt);
  const diagnosticEnv = {
    ...process.env,
    ...ctx.env,
    SENTRY_AUTH_TOKEN: ctx.token,
    EXPO_PUBLIC_SENTRY_DSN: ctx.dsn ?? ctx.env?.EXPO_PUBLIC_SENTRY_DSN,
  };
  const workDir = mkdtempSync(join(outDir, 'work-'));
  activeAttemptReceipt = join(attemptDir, 'verification.json');
  const boundedRun: Run = async (command, args, options) => {
    const remaining = hookDeadline - now();
    if (remaining <= 0) throw new GateError('HOOK_DEADLINE');
    const result = await run(command, args, {
      ...options,
      timeoutMs: Math.min(options?.timeoutMs ?? TOOL_TIMEOUT_MS, remaining),
    });
    checkDeadline();
    return result;
  };
  try {
    save();
    const staged = await stageSymbols({
      archivePath: ctx.archivePath,
      ipaPath: ctx.ipaPath,
      outDir,
      run: boundedRun,
      ctx,
      workDir,
      now,
      checkDeadline,
      attemptDir,
      resolveCli,
    });
    receipt = staged.receipt;
    checkDeadline();
    validateBuildContext(ctx);
    const cli = resolveCli();
    const versions: Record<string, string> = { node: process.version };
    const macOS = await checked(boundedRun, 'sw_vers', ['-productVersion']);
    versions.macOS = macOS;
    for (const [name, command, args] of [
      ['xcode', 'xcrun', ['xcodebuild', '-version']],
      ['dwarfdump', 'xcrun', ['dwarfdump', '--version']],
      ['plutil', 'plutil', ['-help']],
      ['sentryCli', cli, ['--version']],
    ] as const)
      versions[name] = await checked(boundedRun, command, [...args]);
    // These Apple tools have no independent version option; they ship with macOS.
    versions.plutil = `macOS ${macOS}`;
    versions.ditto = `macOS ${macOS}`;
    const { bundles, owned } = await inventoryIpaBundles({
      ipaPath: ctx.ipaPath,
      workDir,
      run: boundedRun,
      checkDeadline,
    });
    const dsyms = await inventoryDsyms({
      archivePath: ctx.archivePath,
      run: boundedRun,
      cli,
      checkDeadline,
      required: owned,
    });
    await staged.completeManifest(bundles, dsyms, versions);
    const requiredPairs = owned.flatMap((bundle) => bundle.uuids);
    requireSymbolCoverage(owned, dsyms);
    requireArchiveIdentity(
      owned,
      requiredIosBundles(
        await discoverBundles(
          join(ctx.archivePath, 'Products', 'Applications'),
          boundedRun,
          checkDeadline,
        ),
      ),
    );
    checkDeadline();
    const vendors = bundles.filter((bundle) => !REQUIRED_IDENTIFIERS.includes(bundle.identifier));
    const localSlices = dsyms.flatMap((dsym) => dsym.slices);
    for (const bundle of vendors) {
      const identifier = sanitizeDiagnostic(bundle.identifier, diagnosticEnv);
      if (!bundle.uuids.length)
        receipt.thirdPartySymbols.push({ identifier, coverage: 'uninspectable' });
      for (const pair of bundle.uuids) {
        const slices = localSlices.filter((slice) => pairKey(slice) === pairKey(pair));
        const coverage = !slices.length
          ? 'missing'
          : slices.some((slice) => (slice.sourceLineBytes ?? 0) > 0)
            ? 'debug-present'
            : slices.some((slice) => slice.sourceLineBytes !== null)
              ? 'limited'
              : 'uninspectable';
        receipt.thirdPartySymbols.push({
          identifier,
          ...pair,
          coverage,
          ...(slices.length ? { upload: 'skipped' as const } : {}),
        });
      }
    }
    // From here on, any failure leaves the complete attempt repairable with --retry-upload.
    activePendingMarker = { outDir, directory: basename(attemptDir) };
    const preflightDeadline = Math.min(hookDeadline, now() + VERIFICATION_TIMEOUT_MS);
    await retryPreflight({
      now,
      sleep,
      deadlineMs: preflightDeadline,
      query: () =>
        queryDebugFiles({
          ctx,
          uuid: requiredPairs[0].uuid,
          fetch: fetchImpl,
          now,
          deadlineMs: preflightDeadline,
          preflight: true,
          onIdentityUnverified: (reason) => {
            receipt.identityUnverified = reason;
          },
        }),
    });
    receipt.preflight = { status: 'passed', updatedAt: timestamp() };
    save();
    stage = 'upload';
    const localFiles = (pairs: UuidArch[], requireDebug: boolean) =>
      dsyms
        .filter((dsym) =>
          dsym.slices.some(
            (slice) =>
              pairs.some((pair) => pairKey(pair) === pairKey(slice)) &&
              (!requireDebug || (slice.sourceLineBytes ?? 0) > 0),
          ),
        )
        .map((dsym) =>
          join(staged.stagedDsymsDir, relative(join(ctx.archivePath, 'dSYMs'), dsym.exePath)),
        );
    const uploadDiagnostics = { ...process.env, SENTRY_AUTH_TOKEN: ctx.token };
    const result = await uploadSymbolFiles(
      boundedRun,
      cli,
      ctx,
      localFiles(requiredPairs, true),
      true,
      UPLOAD_TIMEOUT_MS,
    );
    const uploadFailure = commandFailure(result, 'sentry-cli', uploadDiagnostics);
    receipt.cliExitStatus = result.exitCode;
    receipt.upload = {
      status: uploadFailure ? 'failed' : 'passed',
      updatedAt: timestamp(),
    };
    save();
    if (uploadFailure)
      throw new GateError(uploadFailure.code, `Sentry CLI upload failed: ${uploadFailure.message}`);
    stage = 'remoteVerification';
    const deadlineMs = Math.min(hookDeadline, now() + VERIFICATION_TIMEOUT_MS);
    await waitForRemoteDebug({
      uuids: requiredPairs,
      now,
      sleep,
      deadlineMs,
      fetchRecords: (uuid) => queryDebugFiles({ ctx, uuid, fetch: fetchImpl, now, deadlineMs }),
      onVerified: (record) => {
        receipt.records.push(record);
        save();
      },
    });
    checkDeadline();
    receipt.remoteVerification = { status: 'passed', updatedAt: timestamp() };
    const vendorFiles = localFiles(
      vendors.flatMap((bundle) => bundle.uuids),
      false,
    );
    if (vendorFiles.length) {
      // Reserve the remaining deadline for publishing the mandatory recovery package.
      const budget = Math.min(30_000, Math.floor((hookDeadline - now()) / 4));
      let upload: VendorSymbol['upload'] = 'skipped';
      if (budget > 0) {
        try {
          const optional = await uploadSymbolFiles(
            boundedRun,
            cli,
            ctx,
            vendorFiles,
            false,
            budget,
          );
          upload = commandFailure(optional, 'sentry-cli') ? 'failed' : 'submitted';
        } catch {
          upload = 'failed';
        }
      }
      for (const entry of receipt.thirdPartySymbols)
        if (entry.upload === 'skipped') entry.upload = upload;
    }
    save();
    await staged.publish();
    executables = owned.length;
  } catch (error) {
    receipt[stage] = { status: 'failed', updatedAt: timestamp() };
    receipt.failure = {
      stage,
      code: error instanceof GateError ? error.code : 'IOS_SYMBOL_GATE_FAILED',
      message: sanitizeDiagnostic(
        error instanceof GateError ? error.message : 'iOS symbol gate failed',
        diagnosticEnv,
      ),
      observedAt: timestamp(),
    };
    save();
    if (activePendingMarker) {
      writePendingMarker(activePendingMarker);
      failure = new PendingSymbolUpload(receipt.failure.code, receipt.failure.message);
    } else failure = new GateError(receipt.failure.code, receipt.failure.message);
  } finally {
    // On a remote failure the original zip, manifest and failed receipt already survive in attemptDir.
    if (!failure || failure instanceof PendingSymbolUpload)
      rmSync(workDir, { recursive: true, force: true });
    activeAttemptReceipt = undefined;
    activePendingMarker = undefined;
  }
  if (failure) throw failure;
  // EAS archives this directory. Keep one copy of a successful attempt's original dSYMs.
  rmSync(attemptDir, { recursive: true, force: true });
  return { kind: 'verified' as const, executables, receipt };
}
export async function main() {
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const deadlineMs = Date.now() + HOOK_DEADLINE_MS;
  let ctx: BuildContext | undefined;
  try {
    watchdog = setTimeout(
      () => {
        try {
          const path = activeAttemptReceipt;
          if (!path) throw new GateError('NO_ACTIVE_ATTEMPT');
          const receipt = jsonFile(path) as Receipt;
          if (ctx?.kind === 'active' && receipt.buildId === ctx.buildId) {
            const stage =
              receipt.preflight.status !== 'passed'
                ? 'preflight'
                : receipt.upload.status !== 'passed'
                  ? 'upload'
                  : 'remoteVerification';
            const updatedAt = new Date().toISOString();
            receipt[stage] = { status: 'failed', updatedAt };
            receipt.failure = { stage, code: 'HOOK_DEADLINE', observedAt: updatedAt };
            writeJson(path, receipt);
          }
        } catch {
          console.error('Could not update iOS symbol timeout receipt');
        }
        killActiveChildren();
        console.error('HOOK_DEADLINE: iOS symbol hook deadline exceeded');
        const pending = activePendingMarker;
        if (pending) {
          try {
            writePendingMarker(pending);
            console.error(PENDING_MESSAGE);
            process.exit(0);
          } catch {
            console.error('Could not record the pending iOS symbol upload');
          }
        }
        process.exit(1);
      },
      Math.max(0, deadlineMs + WATCHDOG_GRACE_MS - Date.now()),
    );
    ctx = resolveBuildContext(process.env);
    if (Date.now() >= deadlineMs) throw new GateError('HOOK_DEADLINE');
    const result = await runUploadIosSymbols({ ctx, deadlineMs });
    if (Date.now() >= deadlineMs) throw new GateError('HOOK_DEADLINE');
    if (result.kind === 'skip') console.log(`iOS symbol gate skipped: ${result.reason}`);
    else
      console.log(
        `Sentry debug verification passed for ${result.executables} executables; EAS artifact retention check pending (see verification.json)`,
      );
  } catch (error) {
    console.error(
      sanitizeDiagnostic(error instanceof GateError ? error.message : 'iOS symbol gate failed'),
    );
    if (error instanceof PendingSymbolUpload) {
      console.error(PENDING_MESSAGE);
    } else process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
  }
}
if (basename(process.argv[1] ?? '') === 'uploadIosSymbols.ts') void main();
