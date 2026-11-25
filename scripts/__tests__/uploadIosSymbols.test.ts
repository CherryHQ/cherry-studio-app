import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, relative } from 'node:path';

import { zipSync } from 'fflate';

import {
  type ActiveContext,
  hasQualifyingRecord,
  inventoryDsyms,
  inventoryIpaBundles,
  parseUuidLines,
  queryDebugFiles,
  type RemoteDebugRecord,
  REQUIRED_IDENTIFIERS,
  requiredIosBundles,
  requireSymbolCoverage,
  resolveBuildContext,
  resolveSymbolPackage,
  parseDsnProjectId,
  PendingSymbolUpload,
  resolveSentryCli,
  type Run,
  runUploadIosSymbols,
  runCommand,
  sanitizeDiagnostic,
  checked,
  validateBuildContext,
  stageSymbols,
  waitForRemoteDebug,
  walk,
} from '../uploadIosSymbols';

const uuid = 'c82992fb-86a8-3d5e-847c-bb9132aa9dd3';
const widgetUuid = 'aaaaaaaa-1111-2222-3333-444444444444';
const shareUuid = 'bbbbbbbb-1111-2222-3333-444444444444';
const otherUuid = 'cccccccc-1111-2222-3333-444444444444';
const stripped: RemoteDebugRecord = {
  id: '1234',
  uuid,
  debugId: uuid,
  cpuName: 'arm64',
  symbolType: 'macho',
  objectName: 'CherryStudio',
  codeId: null,
  headers: { 'Content-Type': 'application/x-mach-binary' },
  data: { features: ['symtab', 'unwind'] },
  size: 1234567,
  sha1: 'a'.repeat(40),
  dateCreated: '2026-11-17T00:00:00Z',
};
const full = (debugId = uuid, arch = 'arm64'): RemoteDebugRecord => ({
  ...stripped,
  id: '5678',
  uuid: debugId,
  debugId,
  cpuName: arch,
  data: { features: ['symtab', 'debug', 'unwind'] },
});
const fixtureRoots: string[] = [];
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
}
function put(path: string, value: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}
// Identity-only arm64 Mach-O; debug evidence comes from the CLI stub.
function dwarfBytes(id: string) {
  const bytes = Buffer.alloc(56);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(10, 12);
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(24, 20);
  bytes.writeUInt32LE(0x1b, 32);
  bytes.writeUInt32LE(24, 36);
  Buffer.from(id.replaceAll('-', ''), 'hex').copy(bytes, 40);
  return bytes;
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cherry-symbol-test-')));
  fixtureRoots.push(root);
  const project = join(root, 'project');
  const buildDir = join(project, 'ios/build');
  const archivePath = join(buildDir, 'CherryStudio.xcarchive');
  const ipaPath = join(buildDir, 'release.ipa');
  const source = join(root, 'simulated-ipa');
  const workDir = join(root, 'work');
  const outDir = join(buildDir, 'ios-symbols');
  mkdirSync(workDir, { recursive: true });
  put(ipaPath, 'Simulated IPA bytes, not a real archive');
  put(join(archivePath, 'Info.plist'), 'Simulated archive plist');
  const uuids = [uuid, widgetUuid, shareUuid];
  const names = ['CherryStudio', 'ExpoWidgetsTarget', 'CherryShareExtension'];
  const relPaths = [
    'CherryStudio.app',
    'CherryStudio.app/PlugIns/ExpoWidgetsTarget.appex',
    'CherryStudio.app/PlugIns/CherryShareExtension.appex',
  ];
  const slices = new Map<string, { uuid: string; arch: string }[]>();
  function addBundle(index: number, identifier: string, name: string, relPath: string, id: string) {
    const plist = JSON.stringify({
      CFBundleIdentifier: identifier,
      CFBundleExecutable: name,
      CFBundleShortVersionString: '0.6.0',
      CFBundleVersion: '60',
    });
    const bundle = join(source, 'Payload', relPath);
    const archived = join(archivePath, 'Products/Applications', relPath);
    for (const path of [bundle, archived]) {
      put(join(path, 'Info.plist'), plist);
      // All executable and DWARF bytes in this suite are simulated Mach-O evidence.
      put(join(path, name), `Simulated Mach-O ${index}: ${name}`);
      slices.set(join(path, name), [{ uuid: id, arch: 'arm64' }]);
    }
    const dwarf = join(archivePath, 'dSYMs', `${name}.dSYM/Contents/Resources/DWARF`, name);
    put(dwarf, dwarfBytes(id));
    slices.set(dwarf, [{ uuid: id, arch: 'arm64' }]);
  }
  names.forEach((name, i) => addBundle(i, REQUIRED_IDENTIFIERS[i], name, relPaths[i], uuids[i]));
  const ctx: ActiveContext = {
    kind: 'active',
    buildId: '0d597a16-b6ff-4429-8e74-aca9960f9e8b',
    sourceSha: '1e1bc7acbe0e23dbde016b0e97976f24651c487f',
    sentryUrl: 'https://sentry.example',
    org: 'cherryai',
    project: 'cherry-studio-app',
    token: 'synthetic-test-token',
    dsnProjectId: '1',
    dsn: 'https://syntheticDsnKey@ingest.example/1',
    archivePath,
    ipaPath,
  };
  let uploadExit = 0;
  let clock = 0;
  const localFeatures = new Map<string, string[]>();
  const commands: { command: string; args: string[]; timeoutMs?: number }[] = [];
  const run: Run = jest.fn(async (command, args, options) => {
    commands.push({ command, args, timeoutMs: options?.timeoutMs });
    if (command === 'ditto' && args[0] === '-x') {
      cpSync(source, args[3], { recursive: true });
      // Extraction changes the absolute path; derive UUIDs from the source fixture.
      for (const [path, pairs] of [...slices])
        if (path.startsWith(source)) slices.set(path.replace(source, args[3]), pairs);
    } else if (command === 'ditto' && args[0] === '-c') {
      const entries = Object.fromEntries(
        walk(args.at(-2)!)
          .filter((path) => statSync(path).isFile())
          .map((path) => [`dSYMs/${relative(args.at(-2)!, path)}`, readFileSync(path)]),
      );
      writeFileSync(args.at(-1)!, zipSync(entries));
    } else if (command === 'plutil' && args[0] === '-convert') {
      return { stdout: readFileSync(args.at(-1)!, 'utf8'), exitCode: 0 };
    } else if (command === 'xcrun' && args[0] === 'dwarfdump' && args[1] === '--uuid') {
      const pairs = slices.get(args[2]);
      if (!pairs) throw new Error(`No simulated Mach-O identity for ${args[2]}`);
      return {
        stdout: pairs
          .map((pair) => `UUID: ${pair.uuid.toUpperCase()} (${pair.arch}) ${args[2]}`)
          .join('\n'),
        exitCode: 0,
      };
    } else if (command === 'xcrun' && args[1] === '--statistics') {
      return {
        stdout: JSON.stringify({
          '#bytes with line information': 128,
          '#bytes with line-0 locations': 8,
        }),
        exitCode: 0,
      };
    } else if (command === 'xcrun' && args[0] === 'lipo') {
      const pair = slices.get(args[1])!.find((pair) => pair.arch === args[3])!;
      slices.set(args[5], [pair]);
      localFeatures.set(args[5], localFeatures.get(args[1]) ?? ['symtab', 'debug']);
    } else if (args.includes('check')) {
      const path = args.at(-1)!;
      return {
        stdout: JSON.stringify({
          type: 'dsym',
          variants: (
            slices.get(path) ??
            require('../verifyIosSymbolPackage').readMachOSlices(readFileSync(path))
          ).map((pair: { uuid: string; arch: string }) => ({
            debug_id: pair.uuid,
            arch: pair.arch,
          })),
          features: (localFeatures.get(path) ?? ['symtab', 'debug']).join(', '),
          is_usable: true,
        }),
        exitCode: 0,
      };
    } else if (args.includes('upload')) return { stdout: 'Simulated upload', exitCode: uploadExit };
    return { stdout: 'Simulated tool version 1', exitCode: 0 };
  });
  let rows: (id: string) => RemoteDebugRecord[] = (id) => [full(id)];
  const fetchMock = jest.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const id = new URL(String(input)).searchParams.get('debug_id');
    return new Response(
      JSON.stringify(
        id
          ? rows(id)
          : String(input).includes('/keys/')
            ? [{ isActive: true, dsn: { public: ctx.dsn } }]
            : { id: '1' },
      ),
      { status: 200 },
    );
  });
  const now = () => clock;
  const sleep = jest.fn(async (ms: number) => {
    clock += ms;
  });
  const deps = {
    ctx,
    run,
    fetch: fetchMock as typeof fetch,
    now,
    sleep,
    outDir,
    resolveCli: () => join(root, 'sentry-cli-stub'),
  };
  const attemptDir = () =>
    join(
      outDir,
      readdirSync(outDir)
        .filter((name) => name.startsWith('attempt-'))
        .sort(
          (a, b) => statSync(join(outDir, a)).birthtimeMs - statSync(join(outDir, b)).birthtimeMs,
        )
        .at(-1)!,
    );
  const evidenceDir = () =>
    existsSync(join(outDir, 'package.complete')) ? resolveSymbolPackage(outDir) : attemptDir();
  return {
    ...deps,
    deps,
    root,
    project,
    source,
    workDir,
    buildDir,
    archivePath,
    ipaPath,
    slices,
    localFeatures,
    commands,
    addBundle,
    now,
    sleep,
    setRows: (callback: typeof rows) => {
      rows = callback;
    },
    setUploadExit: (code: number) => {
      uploadExit = code;
    },
    attemptDir,
    packageDir: evidenceDir,
    receipt: () => JSON.parse(readFileSync(join(evidenceDir(), 'verification.json'), 'utf8')),
    manifest: () => JSON.parse(readFileSync(join(evidenceDir(), 'manifest.json'), 'utf8')),
  };
}
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(process, 'platform', platformDescriptor);
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('all three IPA identities upload and verify; retained artifact remains pending', async () => {
  const f = fixture();
  f.deps.fetch = jest.fn(async (input, init) => {
    for (const filename of [
      'dsyms.zip',
      'archive-info.plist',
      'manifest.json',
      'verification.json',
    ])
      expect(statSync(join(f.attemptDir(), filename)).size).toBeGreaterThan(10);
    expect(init?.headers).toEqual({ Authorization: 'Bearer synthetic-test-token' });
    expect(init?.redirect).toBe('manual');
    const url = new URL(String(input));
    if (url.pathname.endsWith('/keys/'))
      return new Response(JSON.stringify([{ isActive: true, dsn: { public: f.ctx.dsn } }]));
    if (!url.searchParams.has('debug_id')) {
      expect(url.pathname).toBe('/api/0/projects/cherryai/cherry-studio-app/');
      return new Response(JSON.stringify({ id: '1' }));
    }
    expect(url.origin + url.pathname).toBe(
      'https://sentry.example/api/0/projects/cherryai/cherry-studio-app/files/dsyms/',
    );
    expect([...url.searchParams.keys()]).toEqual(['debug_id']);
    return new Response(JSON.stringify([full(url.searchParams.get('debug_id')!)]));
  }) as typeof fetch;
  const result = await runUploadIosSymbols(f.deps);
  expect(result.kind).toBe('verified');
  const receipt = f.receipt();
  expect(receipt.remoteVerification.status).toBe('passed');
  expect(receipt.cliExitStatus).toBe(0);
  expect(receipt.records).toHaveLength(3);
  expect(receipt.retention).toEqual({
    status: 'pending-post-build-check',
    expiry: null,
    downloadVerified: false,
  });
  const manifest = f.manifest();
  expect(manifest.schemaVersion).toBe(1);
  expect(
    manifest.bundles.map((bundle: { identifier: string }) => bundle.identifier).sort(),
  ).toEqual(
    [
      'com.cherryai.cherrystudio-app',
      'com.cherryai.cherrystudio-app.ExpoWidgetsTarget',
      'com.cherryai.cherrystudio-app.CherryShareExtension',
    ].sort(),
  );
  expect(manifest.dsyms).toHaveLength(3);
  expect(manifest.symbolPackage.sha256).toBe(
    createHash('sha256')
      .update(readFileSync(join(f.packageDir(), 'dsyms.zip')))
      .digest('hex'),
  );
  expect(receipt.manifestSha256).toBe(
    createHash('sha256')
      .update(readFileSync(join(f.packageDir(), 'manifest.json')))
      .digest('hex'),
  );
  expect(JSON.stringify({ manifest, receipt })).not.toContain(f.ctx.token);
  const upload = f.commands.find((command) => command.args.includes('upload'))!;
  expect(upload.args.slice(0, 8)).toEqual([
    'debug-files',
    'upload',
    '--org',
    'cherryai',
    '--project',
    'cherry-studio-app',
    '--wait-for',
    '120',
  ]);
  expect(upload.command).toBe(f.deps.resolveCli());
  expect(
    upload.args
      .slice(8)
      .map((path) => basename(path))
      .sort(),
  ).toEqual(['CherryShareExtension', 'CherryStudio', 'ExpoWidgetsTarget']);
  expect(upload.timeoutMs).toBe(180_000);
  expect(f.commands.find((command) => command.args[0] === '-c')?.args.slice(0, -1)).toEqual([
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    join(f.archivePath, 'dSYMs'),
  ]);
});
it('a matching full-debug record qualifies alongside a stripped sibling', async () => {
  const f = fixture();
  f.setRows((id) => [{ ...stripped, uuid: id, debugId: id }, full(id)]);
  expect((await runUploadIosSymbols(f.deps)).kind).toBe('verified');
  expect(f.receipt().records.every((row: { id: string }) => row.id === '5678')).toBe(true);
});
it('successful upload with only stripped main symbols is rejected at the deadline', async () => {
  const f = fixture();
  f.setRows((id) => (id === uuid ? [stripped] : [full(id)]));
  expect(hasQualifyingRecord([stripped], uuid, 'arm64')).toBe(false);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('Remote full-debug');
  expect(f.receipt().upload.status).toBe('passed');
  expect(f.receipt().remoteVerification.status).toBe('failed');
  expect(f.now()).toBe(120_000);
});
it('missing main dSYM or either required share/widget bundle fails before upload', async () => {
  for (const missing of ['main', 'widget', 'share']) {
    const f = fixture();
    if (missing === 'main')
      rmSync(join(f.archivePath, 'dSYMs/CherryStudio.dSYM'), { recursive: true });
    else
      rmSync(
        join(
          f.source,
          'Payload/CherryStudio.app/PlugIns',
          missing === 'widget' ? 'ExpoWidgetsTarget.appex' : 'CherryShareExtension.appex',
        ),
        { recursive: true },
      );
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow(
      missing === 'main'
        ? 'Missing original full-debug'
        : 'IPA bundle com.cherryai.cherrystudio-app.',
    );
    expect(f.commands.some((command) => command.args.includes('upload'))).toBe(false);
    expect(f.deps.fetch).not.toHaveBeenCalled();
  }
});
it('archive bundle identities and stale same-name dSYMs cannot substitute for IPA identity', async () => {
  for (const stale of ['dwarf', 'archive-executable', 'archive-plist']) {
    const f = fixture();
    const archived = join(f.archivePath, 'Products/Applications/CherryStudio.app');
    if (stale === 'dwarf') {
      f.slices.set(
        join(f.archivePath, 'dSYMs/CherryStudio.dSYM/Contents/Resources/DWARF/CherryStudio'),
        [{ uuid: otherUuid, arch: 'arm64' }],
      );
    } else if (stale === 'archive-executable')
      f.slices.set(join(archived, 'CherryStudio'), [{ uuid: otherUuid, arch: 'arm64' }]);
    else {
      const path = join(archived, 'Info.plist');
      const plist = JSON.parse(readFileSync(path, 'utf8'));
      put(path, JSON.stringify({ ...plist, CFBundleIdentifier: 'com.example.unrelated' }));
    }
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
    expect(f.deps.fetch).not.toHaveBeenCalled();
  }
});
it('wrong remote UUID or architecture and missing fat-binary slice all fail', async () => {
  for (const mismatch of ['uuid', 'arch', 'fat']) {
    const f = fixture();
    if (mismatch === 'fat')
      for (const [path, pairs] of f.slices)
        if (pairs[0].uuid === uuid && !path.includes('/dSYMs/'))
          f.slices.set(path, [...pairs, { uuid: otherUuid, arch: 'arm64e' }]);
    f.setRows((id) => [
      full(mismatch === 'uuid' ? otherUuid : id, mismatch === 'arch' ? 'x86_64' : 'arm64'),
    ]);
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow(
      mismatch === 'fat' ? 'Missing original full-debug' : 'Remote full-debug',
    );
  }
});
it('malformed JSON/schema, auth/project failures, CLI failure and missing token fail explicitly', async () => {
  for (const status of [401, 403, 404]) {
    const f = fixture();
    f.deps.fetch = jest.fn(async () => new Response('{}', { status })) as typeof fetch;
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow(`HTTP_${status}`);
    expect(f.receipt().identityUnverified).toBe('project-scope');
    expect(f.commands.some((command) => command.args.includes('upload'))).toBe(true);
  }
  for (const body of [
    'not json',
    '{}',
    JSON.stringify([{ ...full(), headers: { features: 123 } }]),
  ]) {
    const f = fixture();
    f.deps.fetch = jest.fn(
      async (input) =>
        new Response(
          new URL(String(input)).searchParams.has('debug_id')
            ? body
            : String(input).includes('/keys/')
              ? JSON.stringify([{ isActive: true, dsn: { public: f.ctx.dsn } }])
              : '{"id":"1"}',
        ),
    ) as typeof fetch;
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
    expect(f.deps.fetch).toHaveBeenCalledTimes(5);
  }
  const f = fixture();
  f.setUploadExit(9);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('Sentry CLI upload failed');
  expect(f.receipt().cliExitStatus).toBe(9);
  expect(f.receipt().upload.status).toBe('failed');
  expect(() =>
    validateBuildContext({ ...f.ctx, env: { ...productionEnv(), SENTRY_AUTH_TOKEN: '' } }),
  ).toThrow('SENTRY_AUTH_TOKEN');
});
it('empty results eventually verify within the deadline and fail beyond it', async () => {
  for (const eventuallyIndexed of [true, false]) {
    const f = fixture();
    f.setRows((id) => (eventuallyIndexed && f.now() >= 10_000 ? [full(id)] : []));
    if (eventuallyIndexed) {
      expect((await runUploadIosSymbols(f.deps)).kind).toBe('verified');
      expect(f.now()).toBe(10_000);
    } else await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('Remote full-debug');
  }
});
it('transport, 429 and 5xx retry with bounded Retry-After; exhaustion fails', async () => {
  for (const mode of ['recover', 'exhaust']) {
    const f = fixture();
    let requests = 0;
    f.deps.fetch = jest.fn(async (input) => {
      requests++;
      if (requests === 1) return new Response('{}', { status: 403 }); // identity unavailable; symbol reads still mandatory
      if (mode === 'exhaust')
        return new Response('{}', { status: 429, headers: { 'Retry-After': '9999' } });
      if (requests === 2) throw new TypeError('Simulated transport failure');
      if (requests === 3)
        return new Response('{}', { status: 429, headers: { 'Retry-After': '7' } });
      if (requests === 4) return new Response('{}', { status: 503 });
      return new Response(
        JSON.stringify([full(new URL(String(input)).searchParams.get('debug_id')!)]),
      );
    }) as typeof fetch;
    if (mode === 'recover') {
      expect((await runUploadIosSymbols(f.deps)).kind).toBe('verified');
      expect(f.sleep.mock.calls.some(([ms]) => ms === 7000)).toBe(true);
    } else {
      await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('Remote full-debug');
      expect(f.now()).toBe(120_000);
      expect(requests).toBe(4); // preflight + at most three concurrent UUID queries
    }
  }
});
it('verification failure preserves staged originals and a sanitized failed receipt', async () => {
  const f = fixture();
  f.setRows(() => []);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
  for (const filename of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
    expect(existsSync(join(f.packageDir(), filename))).toBe(true);
  expect(f.receipt().failure).toMatchObject({
    stage: 'remoteVerification',
    code: 'REMOTE_DEBUG_MISSING',
    message: 'Remote full-debug coverage not verified before deadline',
    observedAt: new Date(120_000).toISOString(),
  });
  expect(JSON.stringify(f.receipt())).not.toContain(f.ctx.token);
});
it('Android, dev, preview, local production and ordinary invocation skip with zero external calls', async () => {
  for (const env of [
    {},
    { EAS_BUILD_PLATFORM: 'android' },
    { EAS_BUILD_PROFILE: 'development' },
    { EAS_BUILD_PROFILE: 'development-simulator' },
    { EAS_BUILD_PROFILE: 'preview' },
    { ...productionEnv(), EAS_BUILD_RUNNER: 'local-build-plugin' },
  ]) {
    const f = fixture();
    const ctx = resolveBuildContext({ NODE_ENV: 'test', ...env });
    expect(ctx.kind).toBe('skip');
    expect((await runUploadIosSymbols({ ...f.deps, ctx })).kind).toBe('skip');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.deps.fetch).not.toHaveBeenCalled();
    expect(existsSync(f.outDir)).toBe(false);
  }
});
function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    EAS_BUILD: 'true',
    EAS_BUILD_RUNNER: 'eas-build',
    EAS_BUILD_PLATFORM: 'ios',
    EAS_BUILD_PROFILE: 'production',
    PROFILE: 'production',
    EAS_BUILD_ID: '0d597a16-b6ff-4429-8e74-aca9960f9e8b',
    EAS_BUILD_GIT_COMMIT_HASH: '1e1bc7acbe0e23dbde016b0e97976f24651c487f',
    SENTRY_AUTH_TOKEN: 'synthetic-test-token',
    EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.com/1',
    SENTRY_URL: 'https://sentry.example',
  };
}
it('claimed cloud production with missing or conflicting guards fails preflight', () => {
  stubPlatform('darwin');
  for (const key of [
    'EAS_BUILD',
    'EAS_BUILD_RUNNER',
    'EAS_BUILD_PLATFORM',
    'EAS_BUILD_PROFILE',
    'PROFILE',
    'EAS_BUILD_ID',
    'EAS_BUILD_GIT_COMMIT_HASH',
  ]) {
    for (const value of ['', 'conflicting']) {
      // Non-ios is a documented skip, so use absent platform to test the claimed build failure.
      if (key === 'EAS_BUILD_PLATFORM' && value) continue;
      expect(() => {
        validateBuildContext({ ...fixture().ctx, env: { ...productionEnv(), [key]: value } });
      }).toThrow(key);
    }
  }
});
it('an additional embedded extension is inventoried without gating the three required targets', async () => {
  const f = fixture();
  f.addBundle(
    3,
    'com.cherryai.cherrystudio-app.Extra',
    'Extra',
    'CherryStudio.app/PlugIns/Extra.appex',
    otherUuid,
  );
  rmSync(join(f.archivePath, 'dSYMs/Extra.dSYM'), { recursive: true });
  const { bundles } = await inventoryIpaBundles({
    ipaPath: f.ipaPath,
    workDir: f.workDir,
    run: f.run,
  });
  expect(bundles).toHaveLength(4);
  const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: f.run });
  expect(() => requireSymbolCoverage(requiredIosBundles(bundles), dsyms)).not.toThrow();
  await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({ kind: 'verified' });
});
it.each(['remote-verification', 'bare-credentials'])(
  'real main prints sanitized %s failures and exits nonzero',
  (mode) => {
    const f = fixture();
    // Exercise the real exported main with only its orchestration boundary stubbed in the child.
    // No test-only production flag, real CLI, network or real waiting is involved.
    const child = join(f.root, 'verification-rejection.cjs');
    put(
      child,
      `
    require(${JSON.stringify(require.resolve('tsx/cjs'))});
    const { readFileSync } = require('node:fs');
    const { transformSync } = require(${JSON.stringify(require.resolve('@babel/core'))});
    const Module = require('node:module');
    const filename = ${JSON.stringify(resolve('scripts/uploadIosSymbols.ts'))};
    const code = transformSync(readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      presets: [${JSON.stringify(require.resolve('@babel/preset-typescript'))}],
      plugins: [${JSON.stringify(require.resolve('@babel/plugin-transform-modules-commonjs'))}]
    }).code;
    const m = new Module(filename, module);
    m.filename = filename; m.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
    require.cache[filename] = m;
    m._compile(code + '\\nresolveBuildContext = () => ({kind:"active"}); runUploadIosSymbols = async () => { ${mode === 'bare-credentials' ? `throw new GateError("TEST_DIAGNOSTIC", process.env.SENTRY_AUTH_TOKEN + " " + new URL(process.env.EXPO_PUBLIC_SENTRY_DSN).username);` : ''} let clock = 0; return waitForRemoteDebug({uuids:[{uuid:"${uuid}",arch:"arm64"}],fetchRecords:async()=>[],now:()=>clock,sleep:async(ms)=>{clock+=ms},deadlineMs:1000}); };', filename);
    m.exports.main();
  `,
    );
    const token = 'syntheticBareAuthToken';
    const key = 'ab12'.repeat(8);
    const result = spawnSync(process.execPath, [child], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        SENTRY_AUTH_TOKEN: token,
        EXPO_PUBLIC_SENTRY_DSN: `https://${key}@ingest.example/1`,
      },
    });
    expect(result.status).toBe(1);
    if (mode === 'bare-credentials') {
      expect(result.stderr).toContain('[redacted] [redacted]');
      expect(result.stderr).not.toContain(key);
      expect(result.stderr).not.toContain(token);
      expect(result.stdout).not.toContain(key);
      expect(result.stdout).not.toContain(token);
    } else
      expect(result.stderr).toContain('Remote full-debug coverage not verified before deadline');
  },
);
it('requires exact identity, architecture, type and feature token', () => {
  expect(hasQualifyingRecord([full()], otherUuid, 'arm64')).toBe(false);
  expect(hasQualifyingRecord([full()], uuid, 'x86_64')).toBe(false);
  expect(hasQualifyingRecord([{ ...full(), symbolType: 'elf' }], uuid, 'arm64')).toBe(false);
  expect(
    hasQualifyingRecord([{ ...full(), data: { features: ['debug_info'] } }], uuid, 'arm64'),
  ).toBe(false);
  expect(hasQualifyingRecord([{ ...full(), data: { features: 'debug' } }], uuid, 'arm64')).toBe(
    false,
  );
  expect(hasQualifyingRecord([null, {}], uuid, 'arm64')).toBe(false);
});
it('UUID parsing normalizes every slice and rejects empty, nil, malformed or ambiguous lines', () => {
  expect(
    parseUuidLines(
      `UUID: ${uuid.toUpperCase()} (ARM64) /simulated\nUUID: ${otherUuid} (arm64e) /simulated`,
    ),
  ).toEqual([
    { uuid, arch: 'arm64' },
    { uuid: otherUuid, arch: 'arm64e' },
  ]);
  for (const output of [
    '',
    'garbage',
    'UUID: 00000000-0000-0000-0000-000000000000 (arm64) /simulated',
    `UUID: ${uuid} (arm64) /a\nUUID: ${otherUuid} (arm64) /b`,
  ])
    expect(() => parseUuidLines(output)).toThrow();
});
it('missing or ambiguous IPA selection fails', async () => {
  const f = fixture();
  put(join(f.buildDir, 'second.ipa'), 'Simulated second IPA');
  await expect(
    inventoryIpaBundles({ ipaPath: f.ipaPath, workDir: f.workDir, run: f.run }),
  ).rejects.toThrow('exactly one');
  rmSync(join(f.buildDir, 'second.ipa'));
  rmSync(f.ipaPath);
  await expect(
    inventoryIpaBundles({ ipaPath: f.ipaPath, workDir: f.workDir, run: f.run }),
  ).rejects.toThrow('exactly one');
});
it('leftover receipt from a different build is rejected without overwriting evidence', async () => {
  const f = fixture();
  const previous = JSON.stringify({ buildId: otherUuid, evidence: 'preserve me' });
  put(join(f.outDir, 'package.complete'), JSON.stringify({ directory: 'package-previous' }));
  put(join(f.packageDir(), 'verification.json'), previous);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('leftover');
  expect(readFileSync(join(f.packageDir(), 'verification.json'), 'utf8')).toBe(previous);
  expect(f.run).not.toHaveBeenCalled();
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
it('pagination is bounded and rejects loops, credential targets and all redirects', async () => {
  const f = fixture();
  const endpoint = `${f.ctx.sentryUrl}/api/0/projects/cherryai/cherry-studio-app/files/dsyms/?debug_id=${uuid}`;
  const query = (fetchImpl: typeof fetch) =>
    queryDebugFiles({ ctx: f.ctx, uuid, fetch: fetchImpl, now: f.now, deadlineMs: 120_000 });
  let page = 0;
  const paginated = jest.fn(
    async () =>
      new Response('[]', {
        headers: { Link: `<${endpoint}&cursor=${++page}>; rel="next"; results="true"` },
      }),
  ) as typeof fetch;
  await expect(query(paginated)).rejects.toThrow('PAGINATION_LIMIT');
  expect(paginated).toHaveBeenCalledTimes(10);
  for (const target of [
    endpoint,
    endpoint.replace('sentry.example', 'evil.example'),
    endpoint.replace('https://', 'https://user:password@'),
    `${endpoint}&token=synthetic`,
  ]) {
    const fetchImpl = jest.fn(
      async () =>
        new Response('[]', { headers: { Link: `<${target}>; rel="next"; results="true"` } }),
    ) as typeof fetch;
    await expect(query(fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  }
  await expect(
    query(
      jest.fn(
        async () =>
          new Response('', {
            status: 302,
            headers: { Location: 'https://user:password@evil.example' },
          }),
      ) as typeof fetch,
    ),
  ).rejects.toThrow('HTTP_302');
  let count = 0;
  const ok = await query(
    jest.fn(
      async () =>
        new Response(JSON.stringify(count++ ? [full()] : [stripped]), {
          headers:
            count === 1 ? { Link: `<${endpoint}&cursor=next>; rel="next"; results="true"` } : {},
        }),
    ) as typeof fetch,
  );
  expect(hasQualifyingRecord(ok, uuid, 'arm64')).toBe(true);
});
it('polling starts after five seconds and limits concurrent UUID queries to three', async () => {
  const f = fixture();
  let concurrent = 0;
  let maximum = 0;
  const ids = [uuid, widgetUuid, shareUuid, otherUuid];
  const observations = await waitForRemoteDebug({
    uuids: ids.map((id) => ({ uuid: id, arch: 'arm64' })),
    now: f.now,
    sleep: f.sleep,
    deadlineMs: 120_000,
    fetchRecords: async (id) => {
      expect(f.now()).toBe(5_000);
      maximum = Math.max(maximum, ++concurrent);
      await Promise.resolve();
      concurrent--;
      return [full(id)];
    },
  });
  expect(observations).toHaveLength(4);
  expect(maximum).toBe(3);
});
it('resolves the installed CLI through the Sentry React Native dependency boundary', () => {
  expect(basename(resolveSentryCli())).toBe('sentry-cli');
  expect(existsSync(resolveSentryCli())).toBe(true);
});
it('existing JS upload wrapper still invokes react-native xcode with automatic uploads enabled', () => {
  const f = fixture();
  const { createRequire } = require('node:module') as typeof import('node:module');
  const projectRequire = createRequire(resolve('package.json'));
  const sdkRequire = createRequire(projectRequire.resolve('@sentry/react-native/package.json'));
  const wrapper = join(
    dirname(sdkRequire.resolve('@sentry/react-native/package.json')),
    'scripts/sentry-xcode.sh',
  );
  const stub = join(f.root, 'sentry-cli-stub.cjs');
  const capture = join(f.root, 'js-upload-args.json');
  put(
    stub,
    "require('node:fs').writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));\n",
  );
  const result = spawnSync('/bin/bash', [wrapper, '/simulated/react-native-xcode.sh'], {
    cwd: join(f.project, 'ios'),
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      NODE_BINARY: process.execPath,
      PROJECT_DIR: join(f.project, 'ios'),
      SENTRY_PROJECT_ROOT: f.project,
      DERIVED_FILE_DIR: f.root,
      SENTRY_CLI_EXECUTABLE: stub,
      SENTRY_COLLECT_MODULES: join(f.root, 'absent-collect-modules.sh'),
      SENTRY_COPY_OPTIONS_FILE: 'false',
      CONFIGURATION: 'Release',
      CAPTURE_PATH: capture,
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(capture, 'utf8')).slice(0, 2)).toEqual(['react-native', 'xcode']);
  const eas = JSON.parse(readFileSync(resolve('eas.json'), 'utf8'));
  expect(eas.build.production.ios.env).toEqual({
    GYM_ARCHIVE_PATH: './build/CherryStudio.xcarchive',
  });
});
it('staging produces the four recovery files before any remote verification', async () => {
  const f = fixture();
  const { bundles } = await inventoryIpaBundles({
    ipaPath: f.ipaPath,
    workDir: f.workDir,
    run: f.run,
  });
  const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: f.run });
  await stageSymbols({
    archivePath: f.archivePath,
    ipaPath: f.ipaPath,
    outDir: f.outDir,
    ipaBundles: bundles,
    dsyms,
    run: f.run,
    ctx: f.ctx,
    workDir: f.workDir,
    now: f.now,
  });
  expect(existsSync(join(f.outDir, 'package.complete'))).toBe(false);
  expect(f.receipt().upload.status).toBe('pending');
  expect(f.receipt().remoteVerification.status).toBe('pending');
  for (const filename of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
    expect(statSync(join(f.attemptDir(), filename)).size).toBeGreaterThan(10);
});

it('active context requires macOS, enabled reporting, valid configuration and the pinned archive', () => {
  const f = fixture();
  stubPlatform('darwin');
  const previousCwd = process.cwd();
  process.chdir(f.project);
  put(
    join(f.project, 'app.json'),
    JSON.stringify({
      expo: {
        plugins: [
          [
            '@sentry/react-native/expo',
            {
              url: 'https://sentry.example/',
              organization: 'cherryai',
              project: 'cherry-studio-app',
            },
          ],
        ],
      },
    }),
  );
  const reporting = join(f.project, 'src/frontend/appShell/observability/reportingServices.json');
  put(reporting, JSON.stringify({ sentry: { enabled: true } }));
  try {
    const env = productionEnv();
    expect(resolveCheckedContext(env)).toMatchObject({
      kind: 'active',
      archivePath: f.archivePath,
      ipaPath: f.ipaPath,
      sourceSha: f.ctx.sourceSha,
    });
    expect(resolveCheckedContext({ ...env, SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD: 'true' }).kind).toBe(
      'active',
    );
    for (const [key, value, message] of [
      ['SENTRY_URL', 'https://user:secret@sentry.example/', 'SENTRY_URL'],
      ['SENTRY_URL', 'http://sentry.example/', 'SENTRY_URL'],
      ['SENTRY_URL', 'invalid', 'SENTRY_URL'],
      ['SENTRY_ORG', 'wrong-org', 'org/project'],
      ['SENTRY_PROJECT', '', 'project'],
      ['EXPO_PUBLIC_STORYBOOK_ENABLED', 'true', 'reporting'],
      ['EXPO_PUBLIC_SENTRY_DSN', '', 'EXPO_PUBLIC_SENTRY_DSN'],
      ['EXPO_PUBLIC_SENTRY_DSN', '   ', 'EXPO_PUBLIC_SENTRY_DSN'],
      ['SENTRY_DISABLE_AUTO_UPLOAD', 'true', 'SENTRY_DISABLE_AUTO_UPLOAD'],
      ['SENTRY_ALLOW_FAILURE', 'true', 'SENTRY_ALLOW_FAILURE'],
      ['SENTRY_DISABLE_XCODE_DEBUG_UPLOAD', 'true', 'SENTRY_DISABLE_XCODE_DEBUG_UPLOAD'],
      ['GYM_ARCHIVE_PATH', '/unrelated/archive', 'GYM_ARCHIVE_PATH'],
      ['EAS_BUILD_ARTIFACT_PATH', '/unrelated/ipa', 'EAS_BUILD_ARTIFACT_PATH'],
    ])
      expect(() => {
        const ctx = resolveCheckedContext({ ...env, [key]: value });
        if (ctx.kind === 'active') validateBuildContext(ctx);
      }).toThrow(message);
    put(reporting, JSON.stringify({ sentry: { enabled: false } }));
    expect(() => validateBuildContext(resolveCheckedContext(env) as ActiveContext)).toThrow(
      'reporting configuration',
    );
    put(reporting, JSON.stringify({ sentry: { enabled: true } }));
    const active = resolveCheckedContext(env) as ActiveContext;
    stubPlatform('linux');
    expect(() => validateBuildContext(active)).toThrow('macOS (darwin)');
    rmSync(f.archivePath, { recursive: true });
    expect(() => resolveCheckedContext(env)).toThrow('archive path');
  } finally {
    process.chdir(previousCwd);
  }
});
it('project preflight ignores its next-page link and reads client keys once', async () => {
  const f = fixture();
  const request = jest.fn(async (input: string) =>
    input.includes('/keys/')
      ? new Response(JSON.stringify([{ isActive: true, dsn: { public: f.ctx.dsn } }]))
      : new Response('{"id":"1"}', {
          headers: {
            Link: `<${f.ctx.sentryUrl}/api/0/projects/cherryai/cherry-studio-app/files/dsyms/?debug_id=${uuid}&cursor=next>; rel="next"; results="true"`,
          },
        }),
  );
  expect(
    await queryDebugFiles({
      ctx: f.ctx,
      uuid,
      fetch: request as typeof fetch,
      now: f.now,
      deadlineMs: 120_000,
      preflight: true,
    }),
  ).toEqual([]);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][0]).toMatch(/\/keys\/$/);
});
it('HTTP timeout covers stalled response bodies and never accepts late debug evidence', async () => {
  const f = fixture();
  jest.useFakeTimers();
  try {
    const response = new Response('[]');
    response.json = () => new Promise(() => {});
    const pending = queryDebugFiles({
      ctx: f.ctx,
      uuid,
      fetch: jest.fn(async () => response) as typeof fetch,
      now: f.now,
      deadlineMs: 120_000,
    });
    const assertion = expect(pending).rejects.toThrow('HTTP_RETRY');
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  } finally {
    jest.useRealTimers();
  }
  await expect(
    waitForRemoteDebug({
      uuids: [{ uuid, arch: 'arm64' }],
      now: f.now,
      sleep: f.sleep,
      deadlineMs: 5_000,
      fetchRecords: async () => [full()],
    }),
  ).rejects.toThrow('Remote full-debug');
});

it('documented feature arrays qualify and header-only feature claims fail closed', () => {
  expect(hasQualifyingRecord([full()], uuid, 'ARM64')).toBe(true);
  const { data: _data, ...headerOnly } = full();
  expect(
    hasQualifyingRecord([{ ...headerOnly, headers: { features: 'symtab,debug' } }], uuid, 'arm64'),
  ).toBe(false);
  expect(hasQualifyingRecord([{ ...full(), debugId: otherUuid }], uuid, 'arm64')).toBe(false);
});
it.each(['id', 'features'])(
  'rejects malformed credential-bearing %s without writing it to the receipt',
  async (field) => {
    const f = fixture();
    const secret = 'syntheticSecret=abc';
    f.setRows((id) => [
      {
        ...full(id),
        ...(field === 'id'
          ? { id: `Bearer-${secret}` }
          : { data: { features: ['debug', `https://signed.example/file?token=${secret}`] } }),
      },
    ]);
    await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'REMOTE_SCHEMA' });
    expect(readFileSync(join(f.packageDir(), 'verification.json'), 'utf8')).not.toContain(secret);
  },
);
it('a failed same-build retry preserves the prior package and receipt evidence', async () => {
  const f = fixture();
  await runUploadIosSymbols(f.deps);
  const previousZip = readFileSync(join(f.packageDir(), 'dsyms.zip'));
  const previous = f.receipt();
  const originalRun = f.run;
  f.deps.run = async (command, args, options) => {
    if (command === 'ditto' && args[0] === '-c') {
      put(args.at(-1)!, 'partial replacement');
      return { stdout: '', exitCode: 1 };
    }
    return originalRun(command, args, options);
  };
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
  expect(readFileSync(join(f.packageDir(), 'dsyms.zip'))).toEqual(previousZip);
  expect(f.receipt().manifestSha256).toBe(previous.manifestSha256);
  expect(f.receipt().records).toEqual(previous.records);
  expect(f.receipt()).toEqual(previous);
});
it('real entry exits nonzero on active cloud preflight failure', () => {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('scripts/uploadIosSymbols.ts')],
    {
      cwd: resolve('.'),
      env: { ...process.env, ...productionEnv(), GYM_ARCHIVE_PATH: '/invalid' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(child.status).not.toBe(0);
  expect(child.stderr).toContain('Missing or invalid');
});
it('rejects an overdue hook and records the deadline', async () => {
  const f = fixture();
  const originalRun = f.run;
  f.deps.run = async (command, args, options) => {
    const result = await originalRun(command, args, options);
    if (args.includes('upload')) await f.sleep(600000);
    return result;
  };
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('HOOK_DEADLINE');
  expect(f.receipt().failure.code).toBe('HOOK_DEADLINE');
});

it('a signal-killed native upload is a failure', async () => {
  const f = fixture();
  const originalRun = f.run;
  f.deps.run = async (command, args, options) =>
    args.includes('upload')
      ? { stdout: '', exitCode: null, signal: 'SIGKILL' }
      : originalRun(command, args, options);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('TOOL_SIGNAL_SIGKILL');
  expect(f.receipt().upload.status).toBe('failed');
});

function resolveCheckedContext(env: NodeJS.ProcessEnv) {
  const ctx = resolveBuildContext(env);
  if (ctx.kind === 'active') validateBuildContext(ctx);
  return ctx;
}

it('wire cpuName is required; invented arch and any missing documented field fail closed', async () => {
  expect(hasQualifyingRecord([full(uuid, 'ARM64')], uuid, 'arm64')).toBe(true);
  for (const key of Object.keys(full())) {
    const record: Record<string, unknown> = { ...full() };
    delete record[key];
    if (key === 'cpuName') {
      record.arch = 'arm64';
      expect(hasQualifyingRecord([record], uuid, 'arm64')).toBe(false);
    }
    const f = fixture();
    f.setRows(() => [record as unknown as RemoteDebugRecord]);
    await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'REMOTE_SCHEMA' });
  }
});

it.each(['framework', 'top-level dylib', 'nested dylib'])(
  'inventories distributed %s and names missing original symbols',
  async (kind) => {
    const f = fixture();
    if (kind === 'framework') {
      f.addBundle(
        3,
        'com.example.Framework',
        'Framework',
        'CherryStudio.app/Frameworks/Framework.framework',
        otherUuid,
      );
      rmSync(join(f.archivePath, 'dSYMs/Framework.dSYM'), { recursive: true });
    } else {
      const rel =
        kind === 'top-level dylib'
          ? 'Payload/libExtra.dylib'
          : 'Payload/CherryStudio.app/Frameworks/Nested/libExtra.dylib';
      const path = join(f.source, rel);
      put(path, 'Simulated dylib');
      f.slices.set(path, [{ uuid: otherUuid, arch: 'arm64' }]);
    }
    await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({
      kind: 'verified',
      executables: 3,
    });
    expect(f.receipt().thirdPartySymbols).toContainEqual(
      expect.objectContaining({
        identifier: expect.stringContaining(
          kind === 'framework' ? 'com.example.Framework' : 'libExtra.dylib',
        ),
        uuid: otherUuid,
        coverage: 'missing',
      }),
    );
    expect(f.receipt().records).toHaveLength(3);
  },
);

it('uploads matching vendor symbols separately without requiring their remote records', async () => {
  const f = fixture();
  f.addBundle(
    3,
    'com.example.Framework',
    'Framework',
    'CherryStudio.app/Frameworks/Framework.framework',
    otherUuid,
  );
  for (const [name, relPath, id] of [
    ['libTop.dylib', 'libTop.dylib', 'dddddddd-1111-2222-3333-444444444444'],
    [
      'libNested.dylib',
      'CherryStudio.app/Frameworks/Nested/libNested.dylib',
      'eeeeeeee-1111-2222-3333-444444444444',
    ],
  ]) {
    for (const path of [
      join(f.source, 'Payload', relPath),
      join(f.archivePath, 'Products/Applications', relPath),
      join(f.archivePath, 'dSYMs', `${name}.dSYM/Contents/Resources/DWARF`, name),
    ]) {
      put(path, path.includes('/dSYMs/') ? dwarfBytes(id) : `Simulated distributed image ${name}`);
      f.slices.set(path, [{ uuid: id, arch: 'arm64' }]);
    }
  }
  f.setRows((id) => ([uuid, widgetUuid, shareUuid].includes(id) ? [full(id)] : []));
  await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({
    kind: 'verified',
    executables: 3,
  });
  expect(f.receipt().records).toHaveLength(3);
  const uploads = f.commands.filter(({ args }) => args.includes('upload'));
  expect(uploads).toHaveLength(2);
  expect(uploads[0].args.join(' ')).not.toContain('Framework.dSYM');
  expect(uploads[1].args.join(' ')).toContain('Framework.dSYM');
  expect(f.receipt().thirdPartySymbols).toHaveLength(3);
});

it('an uninspectable third-party framework is reported without blocking Cherry symbols', async () => {
  const f = fixture();
  f.addBundle(3, 'com.example.Bad', 'Bad', 'CherryStudio.app/Frameworks/Bad.framework', otherUuid);
  const run: Run = (command, args, options) =>
    args[0] === 'dwarfdump' && args[1] === '--uuid' && args[2].endsWith('/Bad')
      ? Promise.resolve({ stdout: '', stderr: 'not Mach-O', exitCode: 4 })
      : f.run(command, args, options);
  await expect(runUploadIosSymbols({ ...f.deps, run })).resolves.toMatchObject({
    kind: 'verified',
  });
  expect(f.receipt().thirdPartySymbols).toContainEqual(
    expect.objectContaining({ coverage: 'uninspectable' }),
  );
});

it('a stripped local duplicate cannot be rescued by existing full remote records', async () => {
  const f = fixture();
  const path = join(f.archivePath, 'dSYMs/CherryStudio.dSYM/Contents/Resources/DWARF/CherryStudio');
  f.localFeatures.set(path, ['symtab', 'unwind']);
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow('Missing original full-debug dSYM');
  expect(f.receipt().failure.code).toBe('SYMBOL_COVERAGE');
  expect(
    f
      .manifest()
      .dsyms.find((dsym: { dwarfPath: string }) => dsym.dwarfPath.endsWith('/CherryStudio'))
      .slices[0].features,
  ).toEqual(['symtab', 'unwind']);
  expect(f.deps.fetch).not.toHaveBeenCalled();
});

it('each fat dSYM slice must carry debug info independently', async () => {
  const f = fixture();
  for (const [path, slices] of f.slices)
    if (slices[0].uuid === uuid)
      f.slices.set(path, [...slices, { uuid: otherUuid, arch: 'arm64e' }]);
  const run: Run = async (command, args, options) => {
    const result = await f.run(command, args, options);
    if (args.includes('check') && args.at(-1)?.endsWith('/arm64e')) {
      const info = JSON.parse(result.stdout);
      info.features = 'symtab';
      return { stdout: JSON.stringify(info), exitCode: 0 };
    }
    return result;
  };
  await expect(runUploadIosSymbols({ ...f.deps, run })).rejects.toThrow('full-debug');
  expect(f.deps.fetch).not.toHaveBeenCalled();
});

it.each(['token', 'DSN', 'CLI resolution', 'tool version', 'inventory'])(
  'stages all recovery files before failing %s preflight',
  async (failure) => {
    const f = fixture();
    if (failure === 'token') f.ctx.token = '';
    if (failure === 'DSN') f.ctx.env = { ...productionEnv(), EXPO_PUBLIC_SENTRY_DSN: '  ' };
    if (failure === 'CLI resolution')
      f.deps.resolveCli = () => {
        throw new Error('CLI unavailable');
      };
    if (failure === 'inventory') f.slices.clear();
    const run: Run = (command, args, options) =>
      failure === 'tool version' && command === 'sw_vers'
        ? Promise.resolve({ stdout: '', stderr: 'sw_vers failed', exitCode: 2 })
        : f.run(command, args, options);
    await expect(runUploadIosSymbols({ ...f.deps, run })).rejects.toThrow();
    for (const name of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
      expect(existsSync(join(f.packageDir(), name))).toBe(true);
    expect(f.receipt().preflight.status).toBe('failed');
    expect(f.receipt().manifestSha256).toBe(
      createHash('sha256')
        .update(readFileSync(join(f.packageDir(), 'manifest.json')))
        .digest('hex'),
    );
    if (failure === 'DSN') expect(f.receipt().failure.code).toBe('SENTRY_DSN_MISSING');
    expect(f.deps.fetch).not.toHaveBeenCalled();
  },
);

it('authenticated preflight retries an initial 503 within its deadline', async () => {
  const f = fixture();
  const original = f.deps.fetch;
  let requests = 0;
  f.deps.fetch = jest.fn(async (input, init) =>
    ++requests === 1 ? new Response('{}', { status: 503 }) : original(input, init),
  );
  expect((await runUploadIosSymbols(f.deps)).kind).toBe('verified');
  expect(f.receipt().preflight.status).toBe('passed');
  expect(f.now()).toBe(10_000);
});

it('preflight retries are bounded and retain a failed receipt on exhaustion', async () => {
  const f = fixture();
  f.deps.fetch = jest.fn(async () => new Response('{}', { status: 503 }));
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'PREFLIGHT_DEADLINE' });
  expect(f.now()).toBe(115_000);
  expect(f.deps.fetch).toHaveBeenCalledTimes(24);
  expect(f.receipt().preflight.status).toBe('failed');
});

it('exit, signal, timeout and spawn failure stay distinct with bounded redacted diagnostics', async () => {
  const env = { ...process.env, SENTRY_AUTH_TOKEN: 'private-test-token' };
  const result = await runCommand(
    process.execPath,
    [
      '-e',
      'process.stderr.write("x".repeat(3000)+process.env.SENTRY_AUTH_TOKEN+" failure reason");process.exit(9)',
    ],
    { env },
  );
  expect(result.exitCode).toBe(9);
  expect(result.stderr).toContain('[redacted] failure reason');
  expect(result.stderr).not.toContain(env.SENTRY_AUTH_TOKEN);
  expect(result.stderr!.length).toBeLessThanOrEqual(2000);
  await expect(checked(async () => result, 'test-tool', [])).rejects.toMatchObject({
    code: 'TOOL_EXIT_9',
  });
  const signalled = await runCommand(process.execPath, [
    '-e',
    'process.kill(process.pid,"SIGTERM")',
  ]);
  expect(signalled.exitCode).toBeNull();
  expect(signalled.signal).toBe('SIGTERM');
  await expect(checked(async () => signalled, 'test-tool', [])).rejects.toMatchObject({
    code: 'TOOL_SIGNAL_SIGTERM',
  });
  const missing = await runCommand('/no/such/cherry-command', []);
  expect(missing.spawnError).toBe('ENOENT');
  await expect(checked(async () => missing, 'test-tool', [])).rejects.toMatchObject({
    code: 'TOOL_SPAWN_ENOENT',
  });
  const timed = await runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    timeoutMs: 100,
  });
  expect(timed.timedOut).toBe(true);
  await expect(checked(async () => timed, 'test-tool', [])).rejects.toMatchObject({
    code: 'TOOL_TIMEOUT',
  });
  // A misleading zero exit code cannot override a recorded signal or timeout.
  await expect(
    checked(async () => ({ stdout: '', exitCode: 0, signal: 'SIGTERM' }), 'test-tool', []),
  ).rejects.toMatchObject({ code: 'TOOL_SIGNAL_SIGTERM' });
});

it('timeout kills a wrapper and its native child as a process group', async () => {
  if (process.platform === 'win32') return;
  const f = fixture();
  const pidFile = join(f.root, 'child.pid');
  const wrapper = join(f.root, 'wrapper.cjs');
  put(
    wrapper,
    `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.on('exit',code=>process.exit(code));`,
  );
  const result = await runCommand(process.execPath, [wrapper], { timeoutMs: 1000 });
  expect(result.timedOut).toBe(true);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await new Promise((accept) => setTimeout(accept, 100));
  expect(() => process.kill(pid, 0)).toThrow();
});

it('signal upload failures retain their cause and redact stderr in the receipt', async () => {
  const f = fixture();
  const run: Run = (command, args, options) =>
    args.includes('upload')
      ? Promise.resolve({
          stdout: '',
          stderr: `${f.ctx.token} native died`,
          exitCode: 0,
          signal: 'SIGTERM',
        })
      : f.run(command, args, options);
  await expect(runUploadIosSymbols({ ...f.deps, run })).rejects.toMatchObject({
    code: 'TOOL_SIGNAL_SIGTERM',
  });
  expect(f.receipt().upload.status).toBe('failed');
  expect(f.receipt().failure.message).toContain('[redacted] native died');
  expect(JSON.stringify(f.receipt())).not.toContain(f.ctx.token);
});

const missingAppleTools =
  process.platform !== 'darwin'
    ? 'requires macOS'
    : (['clang', 'dsymutil', 'dwarfdump', 'lipo'].find(
        (tool) => spawnSync('xcrun', ['--find', tool], { encoding: 'utf8' }).status !== 0,
      ) ?? (spawnSync('/usr/bin/ditto', ['-h'], { encoding: 'utf8' }).error ? 'ditto' : undefined));
if (missingAppleTools)
  console.warn(
    `Skipping real Mach-O recovery contract: Apple tool unavailable (${missingAppleTools})`,
  );
(missingAppleTools ? it.skip : it)(
  'real Mach-O originals survive staging, download extraction and local debug inspection',
  async () => {
    const f = fixture();
    const source = join(f.root, 'tiny.c');
    const object = join(f.root, 'tiny.o');
    const binary = join(f.root, 'Tiny');
    put(source, 'int main(void) { return 0; }\n');
    // Retain the object for dsymutil; clang's temporary object is removed after linking.
    await checked(runCommand, 'xcrun', ['clang', '-g', '-c', source, '-o', object]);
    await checked(runCommand, 'xcrun', ['clang', '-g', object, '-o', binary]);
    rmSync(join(f.archivePath, 'dSYMs'), { recursive: true });
    await checked(runCommand, 'xcrun', [
      'dsymutil',
      binary,
      '-o',
      join(f.archivePath, 'dSYMs/Tiny.dSYM'),
    ]);
    const identities = parseUuidLines(
      await checked(runCommand, 'xcrun', ['dwarfdump', '--uuid', binary]),
    );
    const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: runCommand });
    expect(dsyms[0].uuids).toEqual(identities);
    expect(dsyms[0].slices.every((slice) => slice.features.includes('debug'))).toBe(true);
    const staged = await stageSymbols({
      archivePath: f.archivePath,
      ipaPath: f.ipaPath,
      outDir: f.outDir,
      ipaBundles: REQUIRED_IDENTIFIERS.map((identifier) => ({
        relPath: 'Tiny.app',
        identifier,
        executable: 'Tiny',
        version: '1',
        build: '1',
        uuids: identities,
      })),
      dsyms,
      run: runCommand,
      ctx: f.ctx,
      workDir: f.workDir,
      now: f.now,
    });
    const { receipt } = staged;
    const extracted = join(f.root, 'real-extracted');
    await checked(runCommand, 'ditto', [
      '-x',
      '-k',
      join(staged.attemptDir, 'dsyms.zip'),
      extracted,
    ]);
    const recovered = await inventoryDsyms({ archivePath: extracted, run: runCommand });
    expect(recovered[0].uuids).toEqual(identities);
    expect(recovered[0].slices[0].features).toContain('debug');
    expect(readFileSync(recovered[0].exePath)).toEqual(readFileSync(dsyms[0].exePath));
    cpSync(binary, recovered[0].exePath);
    const strippedDuplicate = await inventoryDsyms({ archivePath: extracted, run: runCommand });
    expect(strippedDuplicate[0].uuids).toEqual(identities);
    expect(strippedDuplicate[0].slices[0].features).not.toContain('debug');
    expect(() =>
      requireSymbolCoverage(
        [
          {
            relPath: 'Tiny.app',
            identifier: 'Tiny',
            executable: 'Tiny',
            version: '1',
            build: '1',
            uuids: identities,
          },
        ],
        strippedDuplicate,
      ),
    ).toThrow('Tiny');
    for (const stage of ['preflight', 'upload', 'remoteVerification'] as const)
      receipt[stage].status = 'passed';
    receipt.records = identities.map((pair) => ({
      ...pair,
      id: '123',
      symbolType: 'macho',
      features: ['debug'],
      observedAt: new Date(0).toISOString(),
    }));
    put(join(staged.attemptDir, 'verification.json'), JSON.stringify(receipt));
    await staged.publish();
    const { verifyIosSymbolPackage } =
      require('../verifyIosSymbolPackage') as typeof import('../verifyIosSymbolPackage');
    // Exercise both archive formats without assuming the extra-artifact URL's extension.
    for (const format of ['zip', 'tar']) {
      const archive = join(f.root, `buildArtifacts.${format}`);
      if (format === 'zip')
        await checked(runCommand, 'ditto', ['-c', '-k', '--keepParent', f.outDir, archive]);
      else
        await checked(runCommand, 'tar', ['-czf', archive, '-C', dirname(f.outDir), 'ios-symbols']);
      await expect(
        verifyIosSymbolPackage({
          archivePath: archive,
          buildId: f.ctx.buildId,
          now: f.now,
        }),
      ).resolves.toMatchObject({
        status: 'download-verified',
        slices: identities.length,
        expiry: 'unknown',
      });
    }
  },
);

it.each(['current', 'previous'])(
  'the referenced watchdog fails a hung run and preserves the correct %s receipt',
  (attempt) => {
    const f = fixture();
    put(join(f.outDir, 'package.complete'), JSON.stringify({ directory: 'package-watchdog' }));
    const selectedReceiptPath = join(f.packageDir(), 'verification.json');
    put(selectedReceiptPath, JSON.stringify({ buildId: f.ctx.buildId, earlierSuccess: true }));
    const selectedReceipt = readFileSync(selectedReceiptPath);
    const receiptPath = join(f.outDir, 'attempt-watchdog', 'verification.json');
    put(
      receiptPath,
      JSON.stringify({
        buildId: f.ctx.buildId,
        preflight: { status: 'pending' },
        upload: { status: 'pending' },
        remoteVerification: { status: 'pending' },
      }),
    );
    const originalReceipt = readFileSync(receiptPath);
    const child = join(f.root, 'watchdog.cjs');
    put(
      child,
      `
    require(${JSON.stringify(require.resolve('tsx/cjs'))});
    const { readFileSync } = require('node:fs');
    const { transformSync } = require(${JSON.stringify(require.resolve('@babel/core'))});
    const Module = require('node:module');
    const filename = ${JSON.stringify(resolve('scripts/uploadIosSymbols.ts'))};
    const code = transformSync(readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [${JSON.stringify(require.resolve('@babel/preset-typescript'))}], plugins: [${JSON.stringify(require.resolve('@babel/plugin-transform-modules-commonjs'))}] }).code;
    const timer = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms > 500000 ? 20 : ms, ...args);
    const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
    require.cache[filename] = m;
    m._compile(code + '\\nresolveBuildContext = () => ({kind:"active",buildId:"${f.ctx.buildId}"}); runUploadIosSymbols = () => { ${attempt === 'current' ? `activeAttemptReceipt = ${JSON.stringify(receiptPath)};` : ''} return new Promise(() => {}); };', filename);
    m.exports.main();
  `,
    );
    const result = spawnSync(process.execPath, [child], {
      cwd: f.project,
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HOOK_DEADLINE');
    expect(readFileSync(selectedReceiptPath)).toEqual(selectedReceipt);
    if (attempt === 'current')
      expect(JSON.parse(readFileSync(receiptPath, 'utf8')).failure.code).toBe('HOOK_DEADLINE');
    else expect(readFileSync(receiptPath)).toEqual(originalReceipt);
  },
);

it('a Sentry upload cut off at the hook deadline leaves the build repairable', () => {
  const f = fixture();
  const child = join(f.root, 'deadline-upload.cjs');
  put(
    child,
    `
    require(${JSON.stringify(require.resolve('tsx/cjs'))});
    const { readFileSync } = require('node:fs');
    const { transformSync } = require(${JSON.stringify(require.resolve('@babel/core'))});
    const Module = require('node:module');
    const filename = ${JSON.stringify(resolve('scripts/uploadIosSymbols.ts'))};
    const code = transformSync(readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [${JSON.stringify(require.resolve('@babel/preset-typescript'))}], plugins: [${JSON.stringify(require.resolve('@babel/plugin-transform-modules-commonjs'))}] }).code;
    // Shift only hook-budget timers, keeping their real order and gaps.
    const timer = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms > 500000 ? ms - 599700 : ms, ...args);
    const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
    require.cache[filename] = m;
    // Mirror boundedRun: a real native upload is bounded by the remaining hook budget.
    m._compile(code + '\\nresolveBuildContext = () => ({kind:"active",buildId:"${f.ctx.buildId}"}); runUploadIosSymbols = async ({ deadlineMs }) => { const result = await runCommand("/bin/sleep", ["30"], { timeoutMs: deadlineMs - Date.now() }); throw new PendingSymbolUpload(result.timedOut ? "HOOK_DEADLINE" : "UNEXPECTED"); };', filename);
    m.exports.main();
  `,
  );
  const result = spawnSync(process.execPath, [child], {
    cwd: f.project,
    encoding: 'utf8',
    timeout: 10000,
  });
  expect(result.stderr).not.toContain('hook deadline exceeded');
  expect(result.stderr).toContain('Original symbols retained for retry');
  expect(result.status).toBe(0);
});

it('the watchdog records a hung Sentry stage as pending instead of failing the build', () => {
  const f = fixture();
  const child = join(f.root, 'watchdog-pending.cjs');
  put(
    child,
    `
    require(${JSON.stringify(require.resolve('tsx/cjs'))});
    const { readFileSync } = require('node:fs');
    const { transformSync } = require(${JSON.stringify(require.resolve('@babel/core'))});
    const Module = require('node:module');
    const filename = ${JSON.stringify(resolve('scripts/uploadIosSymbols.ts'))};
    const code = transformSync(readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [${JSON.stringify(require.resolve('@babel/preset-typescript'))}], plugins: [${JSON.stringify(require.resolve('@babel/plugin-transform-modules-commonjs'))}] }).code;
    const timer = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => timer(fn, ms > 500000 ? 20 : ms, ...args);
    const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
    require.cache[filename] = m;
    m._compile(code + '\\nresolveBuildContext = () => ({kind:"active",buildId:"${f.ctx.buildId}"}); runUploadIosSymbols = () => { activePendingMarker = { outDir: ${JSON.stringify(f.outDir)}, directory: "attempt-hung" }; return new Promise(() => {}); };', filename);
    m.exports.main();
  `,
  );
  mkdirSync(f.outDir, { recursive: true });
  const result = spawnSync(process.execPath, [child], {
    cwd: f.project,
    encoding: 'utf8',
    timeout: 10000,
  });
  expect(result.stderr).toContain('HOOK_DEADLINE');
  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(join(f.outDir, 'upload.pending'), 'utf8'))).toEqual({
    directory: 'attempt-hung',
  });
});

it('a deadline after Sentry verification keeps the same build repairable', async () => {
  const f = fixture();
  const originalRun = f.run;
  let uploaded = false;
  f.deps.run = async (command, args, options) => {
    if (args.includes('upload')) uploaded = true;
    // Publishing re-inspects the prepared package; let it overrun the hook budget.
    if (uploaded && args.includes('check')) await f.sleep(600000);
    return originalRun(command, args, options);
  };
  await expect(runUploadIosSymbols(f.deps)).rejects.toBeInstanceOf(PendingSymbolUpload);
  expect(f.receipt().upload.status).toBe('passed');
  expect(existsSync(join(f.outDir, 'upload.pending'))).toBe(true);
  expect(existsSync(join(f.outDir, 'package.complete'))).toBe(false);
});

it.each([
  ['ExpoWidgetsTarget', 'com.cherryai.cherrystudio-app.ExpoWidgetsTarget'],
  ['CherryShareExtension', 'com.cherryai.cherrystudio-app.CherryShareExtension'],
])('missing %s own dSYM fails with both extension bundles intact', async (name, identifier) => {
  const f = fixture();
  const relPath = `CherryStudio.app/PlugIns/${name}.appex`;
  expect(existsSync(join(f.source, 'Payload', relPath))).toBe(true);
  expect(existsSync(join(f.archivePath, 'Products/Applications', relPath))).toBe(true);
  rmSync(join(f.archivePath, 'dSYMs', `${name}.dSYM`), { recursive: true });
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({
    code: 'SYMBOL_COVERAGE',
    message: expect.stringContaining(identifier),
  });
  expect(f.commands.some((command) => command.args.includes('upload'))).toBe(false);
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
it('incomplete cloud markers fail instead of silently skipping', () => {
  expect(() =>
    resolveBuildContext({
      NODE_ENV: 'test',
      EAS_BUILD_PLATFORM: 'ios',
      EAS_BUILD_PROFILE: 'production',
      EAS_BUILD_ID: uuid,
    }),
  ).toThrow('EAS_BUILD_RUNNER');
  for (const key of ['EAS_BUILD_ID', 'EAS_BUILD_PLATFORM', 'EAS_BUILD_PROFILE', 'EAS_BUILD'])
    expect(() =>
      resolveBuildContext({
        NODE_ENV: 'test',
        [key]: key === 'EAS_BUILD_PLATFORM' ? 'ios' : 'production',
      }),
    ).toThrow();
});
it('production-domestic-stores on iOS passes identity validation and is gated', async () => {
  const f = fixture();
  const cwd = process.cwd();
  process.chdir(f.project);
  try {
    const ctx = resolveBuildContext({
      ...productionEnv(),
      EAS_BUILD_PROFILE: 'production-domestic-stores',
    });
    expect(ctx.kind).toBe('active');
    // The resolved cloud context proceeds into the gate; missing token must fail rather than skip.
    if (ctx.kind === 'active') ctx.env!.SENTRY_AUTH_TOKEN = '';
    await expect(runUploadIosSymbols({ ...f.deps, ctx })).rejects.toMatchObject({
      code: 'SENTRY_TOKEN_MISSING',
    });
    expect(f.receipt().preflight.status).toBe('failed');
  } finally {
    process.chdir(cwd);
  }
});
it('a DSN for another project fails the authenticated read before upload and stays private', async () => {
  const f = fixture();
  const dsn = 'https://syntheticDsnKey@ingest.example/999';
  f.ctx.dsnProjectId = parseDsnProjectId(dsn);
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({
    code: 'SENTRY_DSN_PROJECT_MISMATCH',
  });
  expect(f.deps.fetch).toHaveBeenCalledTimes(1);
  expect(f.commands.some((command) => command.args.includes('upload'))).toBe(false);
  const receipt = JSON.stringify(f.receipt());
  expect(receipt).not.toContain(dsn);
  expect(receipt).not.toContain('syntheticDsnKey');
});
it.each([
  'not a DSN',
  'https://key@ingest.example/no-project',
  'https://ingest.example/1',
  'https://key@ingest.example/1?secret=hidden',
])('rejects malformed DSN without echoing it (%s)', (dsn) => {
  expect(() => parseDsnProjectId(dsn)).toThrow('SENTRY_DSN_INVALID');
});
it.each([
  { id: 'syntheticSecret=abc' },
  { data: { features: ['debug', 'https://signed.example/?token=syntheticSecret'] } },
  { objectName: 'control\ncharacter' },
  { sha1: 'A'.repeat(40) },
  { size: -1 },
  { size: 1.5 },
  { dateCreated: 'invalid date' },
])('rejects unsafe remote receipt values with a sanitized code (%j)', async (fields) => {
  const f = fixture();
  f.setRows((id) => [{ ...full(id), ...fields }]);
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'REMOTE_SCHEMA' });
  expect(JSON.stringify(f.receipt())).not.toContain('syntheticSecret');
});
it.each(['plist', 'manifest', 'receipt', 'marker'])(
  'interrupted %s publication preserves every prior byte and retains copied originals',
  async (boundary) => {
    const f = fixture();
    await runUploadIosSymbols(f.deps);
    const previousDirectory = f.packageDir();
    const previous = Object.fromEntries(
      readdirSync(previousDirectory).map((name) => [
        name,
        readFileSync(join(previousDirectory, name)),
      ]),
    );
    const marker = readFileSync(join(f.outDir, 'package.complete'));
    const fs = require('node:fs') as typeof import('node:fs');
    const copy = fs.copyFileSync;
    const write = fs.writeFileSync;
    const rename = fs.renameSync;
    let injected = false;
    jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, mode) => {
      if (
        (boundary === 'plist' && String(destination).endsWith('archive-info.plist')) ||
        (boundary === 'receipt' &&
          String(destination).includes('/package-') &&
          String(destination).endsWith('verification.json'))
      ) {
        injected = true;
        throw new Error('injected plist failure');
      }
      return copy(source, destination, mode);
    });
    jest.spyOn(fs, 'writeFileSync').mockImplementation((path, bytes, options) => {
      if (boundary === 'manifest' && String(path).includes('/manifest.json.')) {
        injected = true;
        throw new Error('injected write failure');
      }
      return write(path, bytes, options);
    });
    jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (boundary === 'marker' && String(destination).endsWith('/package.complete')) {
        injected = true;
        throw new Error('injected publication failure');
      }
      return rename(source, destination);
    });
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
    expect(injected).toBe(true);
    expect(readFileSync(join(f.outDir, 'package.complete'))).toEqual(marker);
    for (const [name, bytes] of Object.entries(previous))
      expect(readFileSync(join(previousDirectory, name))).toEqual(bytes);
    if (boundary === 'receipt' || boundary === 'marker') {
      // Publication follows Sentry work, so the attempt's original ZIP stays repairable.
      const pending = JSON.parse(readFileSync(join(f.outDir, 'upload.pending'), 'utf8'));
      expect(existsSync(join(f.outDir, pending.directory, 'dsyms.zip'))).toBe(true);
      return;
    }
    const copies = walk(f.outDir).filter(
      (path) => path.includes('/work-') && path.endsWith('/DWARF/CherryStudio'),
    );
    expect(copies).toHaveLength(1);
    expect(readFileSync(copies[0])).toEqual(
      readFileSync(
        join(f.archivePath, 'dSYMs/CherryStudio.dSYM/Contents/Resources/DWARF/CherryStudio'),
      ),
    );
  },
);
it.each(['invalid', 'incomplete'])(
  'rejects a successful packager with %s ZIP output and keeps original dSYMs',
  async (mode) => {
    const f = fixture();
    f.deps.run = async (command, args, options) => {
      if (command === 'ditto' && args[0] === '-c') {
        writeFileSync(args.at(-1)!, mode === 'invalid' ? Buffer.from('not a zip') : zipSync({}));
        return { stdout: '', exitCode: 0 };
      }
      return f.run(command, args, options);
    };
    await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({
      code: mode === 'invalid' ? 'PACKAGE_ZIP_INVALID' : 'PACKAGE_ZIP_CONTENTS',
    });
    expect(existsSync(join(f.outDir, 'package.complete'))).toBe(false);
    expect(
      walk(f.outDir).some(
        (path) => path.includes('/work-') && path.endsWith('/DWARF/CherryStudio'),
      ),
    ).toBe(true);
  },
);

function artifactArchive(f: ReturnType<typeof fixture>) {
  const path = join(f.root, 'buildArtifacts.zip');
  writeFileSync(
    path,
    zipSync(
      Object.fromEntries(
        walk(f.outDir)
          .filter((path) => statSync(path).isFile())
          .map((path) => [`ios-symbols/${relative(f.outDir, path)}`, readFileSync(path)]),
      ),
    ),
  );
  return path;
}

it.each(['pre-upload', 'invalid-replacement', 'remote-verification'])(
  'retry after successful publication preserves the selected verified package (%s)',
  async (failure) => {
    const f = fixture();
    const { verifyIosSymbolPackage } =
      require('../verifyIosSymbolPackage') as typeof import('../verifyIosSymbolPackage');
    await runUploadIosSymbols(f.deps);
    const selected = resolveSymbolPackage(f.outDir);
    const previous = f.receipt();
    const before = Object.fromEntries(
      readdirSync(selected).map((name) => [name, readFileSync(join(selected, name))]),
    );
    if (failure === 'pre-upload')
      f.deps.resolveCli = () => {
        throw new Error('injected retry failure before upload');
      };
    if (failure === 'invalid-replacement') {
      // A corrupt Mach-O identity must still fail independent package verification.
      const path = join(
        f.archivePath,
        'dSYMs/CherryStudio.dSYM/Contents/Resources/DWARF/CherryStudio',
      );
      const bytes = readFileSync(path);
      bytes.writeUInt32LE(0, 32);
      writeFileSync(path, bytes);
    }
    if (failure === 'remote-verification') f.setRows(() => []);
    await expect(runUploadIosSymbols(f.deps)).rejects.toThrow();
    expect(resolveSymbolPackage(f.outDir)).toBe(selected);
    expect(f.receipt()).toEqual(previous);
    for (const [name, bytes] of Object.entries(before))
      expect(readFileSync(join(selected, name))).toEqual(bytes);
    const attempt = JSON.parse(readFileSync(join(f.attemptDir(), 'verification.json'), 'utf8'));
    expect(attempt.failure).not.toBeNull();
    if (failure === 'pre-upload') {
      expect(attempt.upload.status).toBe('pending');
      expect(f.commands.filter((command) => command.args.includes('upload'))).toHaveLength(1);
    }
    await expect(
      verifyIosSymbolPackage({
        archivePath: artifactArchive(f),
        buildId: f.ctx.buildId,
        run: f.run,
        resolveCli: () => join(f.root, 'sentry-cli-stub'),
      }),
    ).resolves.toMatchObject({ status: 'download-verified', slices: 3 });
  },
);

it.each([
  ['production', 'preview-production'],
  ['preview-production', 'production'],
  ['production-beta', 'development'],
  ['development', 'production-beta'],
])(
  'rejects contradictory profile classes before skips (PROFILE=%s, EAS_BUILD_PROFILE=%s)',
  (profile, easProfile) => {
    expect(() =>
      resolveBuildContext({ ...productionEnv(), PROFILE: profile, EAS_BUILD_PROFILE: easProfile }),
    ).toThrow('contradictory PROFILE');
  },
);

it.each(['Test App', 'Test App (Release) + Framework!'])(
  'accepts Mach-O object name %s without persisting it',
  async (objectName) => {
    const f = fixture();
    f.setRows((id) => [{ ...full(id), objectName }]);
    await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({ kind: 'verified' });
    expect(JSON.stringify(f.receipt())).not.toContain('objectName');
    expect(JSON.stringify(f.receipt())).not.toContain('Test App');
  },
);

it.each(['host', 'key'])(
  'same project ID with a different DSN %s fails a readable client-key check',
  async (field) => {
    const f = fixture();
    const original = f.deps.fetch;
    f.deps.fetch = jest.fn(async (input, init) =>
      String(input).includes('/keys/')
        ? new Response(
            JSON.stringify([
              {
                isActive: true,
                dsn: {
                  public:
                    field === 'host'
                      ? 'https://syntheticDsnKey@other.example/1'
                      : 'https://otherPrivateKey@ingest.example/1',
                },
              },
            ]),
          )
        : original(input, init),
    );
    await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({
      code: 'SENTRY_DSN_KEY_MISMATCH',
    });
    expect(f.commands.some((command) => command.args.includes('upload'))).toBe(false);
    const evidence = JSON.stringify({ receipt: f.receipt(), manifest: f.manifest() });
    for (const value of [f.ctx.dsn!, 'syntheticDsnKey', 'otherPrivateKey'])
      expect(evidence).not.toContain(value);
  },
);

it.each([401, 403, 404])(
  'unreadable identity endpoints (%s) never become a symbol-token scope requirement',
  async (status) => {
    for (const endpoint of ['project', 'client-key']) {
      const f = fixture();
      const original = f.deps.fetch;
      f.deps.fetch = jest.fn(async (input, init) => {
        const url = new URL(String(input));
        if (
          !url.searchParams.has('debug_id') &&
          (endpoint === 'project' || url.pathname.endsWith('/keys/'))
        )
          return new Response('{}', { status });
        return original(input, init);
      });
      await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({ kind: 'verified' });
      expect(f.receipt().identityUnverified).toBe(
        endpoint === 'project' ? 'project-scope' : 'client-key-scope',
      );
      expect(f.receipt().records).toHaveLength(3);
      const { verifyIosSymbolPackage } =
        require('../verifyIosSymbolPackage') as typeof import('../verifyIosSymbolPackage');
      await expect(
        verifyIosSymbolPackage({
          archivePath: artifactArchive(f),
          buildId: f.ctx.buildId,
          run: f.run,
          resolveCli: () => join(f.root, 'sentry-cli-stub'),
        }),
      ).resolves.toMatchObject({ status: 'download-verified' });
    }
  },
);

it.each(['features', 'id', 'both'])(
  'rejects credential-shaped %s with no receipt, manifest or log leak',
  async (field) => {
    const f = fixture();
    const key = 'ab12'.repeat(8);
    f.ctx.dsn = `https://${key}@ingest.example/1`;
    f.setRows((id) => [
      {
        ...full(id),
        ...(field !== 'features' ? { id: key } : {}),
        ...(field !== 'id' ? { data: { features: ['debug', key] } } : {}),
      },
    ]);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    let caught: unknown;
    try {
      await runUploadIosSymbols(f.deps);
    } catch (error) {
      caught = error;
      console.error(String(error));
    }
    expect(caught).toMatchObject({ code: 'REMOTE_SCHEMA' });
    for (const path of walk(f.outDir).filter((path) =>
      /(?:verification|manifest)\.json$/.test(path),
    )) {
      const contents = readFileSync(path, 'utf8');
      expect(contents).not.toContain(key);
      expect(contents).not.toContain(f.ctx.token);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain(key);
    expect(JSON.stringify(log.mock.calls)).not.toContain(f.ctx.token);
  },
);

it('redacts bare DSN keys and auth tokens in tool versions and diagnostics', async () => {
  const f = fixture();
  const key = 'ab12'.repeat(8);
  f.ctx.dsn = `https://${key}@ingest.example/1`;
  const original = f.run;
  f.deps.run = async (command, args, options) =>
    args.includes('--version')
      ? { stdout: `version 1 ${key} ${f.ctx.token}`, exitCode: 0 }
      : original(command, args, options);
  await runUploadIosSymbols(f.deps);
  const evidence = JSON.stringify({ receipt: f.receipt(), manifest: f.manifest() });
  expect(evidence).not.toContain(key);
  expect(evidence).not.toContain(f.ctx.token);
  expect(evidence).toContain('[redacted]');
  const env = { EXPO_PUBLIC_SENTRY_DSN: f.ctx.dsn, SENTRY_AUTH_TOKEN: f.ctx.token };
  expect(sanitizeDiagnostic(`bare ${key} ${f.ctx.token}`, env)).toBe('bare [redacted] [redacted]');
});

it('rejects credential-shaped local feature strings before manifest persistence', async () => {
  const f = fixture();
  const key = 'ab12'.repeat(8);
  f.ctx.dsn = `https://${key}@ingest.example/1`;
  f.localFeatures.set(
    join(f.archivePath, 'dSYMs/CherryStudio.dSYM/Contents/Resources/DWARF/CherryStudio'),
    ['debug', key],
  );
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'LOCAL_DEBUG_SCHEMA' });
  expect(JSON.stringify({ receipt: f.receipt(), manifest: f.manifest() })).not.toContain(key);
});

it('a successful retry atomically selects a new package that verifies', async () => {
  const f = fixture();
  await runUploadIosSymbols(f.deps);
  const previousDirectory = resolveSymbolPackage(f.outDir);
  const previousReceipt = readFileSync(join(previousDirectory, 'verification.json'));
  await runUploadIosSymbols(f.deps);
  expect(resolveSymbolPackage(f.outDir)).not.toBe(previousDirectory);
  expect(readFileSync(join(previousDirectory, 'verification.json'))).toEqual(previousReceipt);
  expect(f.receipt().createdAt).toBe(new Date(5_000).toISOString());
  const { verifyIosSymbolPackage } =
    require('../verifyIosSymbolPackage') as typeof import('../verifyIosSymbolPackage');
  await expect(
    verifyIosSymbolPackage({
      archivePath: artifactArchive(f),
      buildId: f.ctx.buildId,
      run: f.run,
      resolveCli: () => join(f.root, 'sentry-cli-stub'),
    }),
  ).resolves.toMatchObject({ status: 'download-verified', slices: 3 });
});

it('client-key pagination accepts an active matching key on a later page', async () => {
  const f = fixture();
  const original = f.deps.fetch;
  f.deps.fetch = jest.fn(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/keys/') && !url.searchParams.has('cursor'))
      return new Response('[]', {
        headers: { Link: `<${url.href}?cursor=next>; rel="next"; results="true"` },
      });
    return original(input, init);
  });
  await expect(runUploadIosSymbols(f.deps)).resolves.toMatchObject({ kind: 'verified' });
  expect(f.receipt().identityUnverified).toBeUndefined();
  expect(
    (f.deps.fetch as jest.Mock).mock.calls.filter(([input]) => String(input).includes('/keys/')),
  ).toHaveLength(2);
});

it('redacts local bundle metadata and informational paths in the persisted manifest', async () => {
  const f = fixture();
  const key = 'ab12'.repeat(8);
  f.ctx.dsn = `https://${key}@ingest.example/1`;
  const { bundles } = await inventoryIpaBundles({
    ipaPath: f.ipaPath,
    workDir: f.workDir,
    run: f.run,
  });
  const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: f.run });
  const unknownKey = '9876543210abcdef'.repeat(2);
  const normalizedSecret = 'normalized-query-secret';
  bundles[0].version = `${key} ${f.ctx.token} ${f.ctx.dsn}`;
  bundles[1].version = `${unknownKey} https:/host/path?token=${normalizedSecret}`;
  bundles[0].build = f.ctx.token;
  bundles[0].executable = key;
  bundles[0].relPath = join(f.workDir, key, f.ctx.token, 'App.app');
  dsyms[0].relPath = join(f.archivePath, key, f.ctx.token, 'App.dSYM');
  await stageSymbols({
    archivePath: f.archivePath,
    ipaPath: f.ipaPath,
    outDir: f.outDir,
    run: f.run,
    ctx: f.ctx,
    workDir: f.workDir,
    ipaBundles: bundles,
    dsyms,
  });
  const contents = readFileSync(join(f.attemptDir(), 'manifest.json'), 'utf8');
  for (const secret of [key, f.ctx.token, f.ctx.dsn, unknownKey, normalizedSecret])
    expect(contents).not.toContain(secret);
  expect(contents).toContain('[redacted]');
  const manifest = JSON.parse(contents);
  expect(manifest.bundles[0].version).toBe('[redacted] [redacted] [redacted]');
  expect(manifest.bundles[0].relPath).toBe('[redacted]/[redacted]/App.app');
  expect(manifest.dsyms[0].relPath).toBe('[redacted]/[redacted]/App.dSYM');
  expect(manifest.sourceSha).toBe(f.ctx.sourceSha);
  expect(manifest.dsyms[0].sha256).toBe(
    createHash('sha256').update(readFileSync(dsyms[0].exePath)).digest('hex'),
  );
  expect(manifest.ipa.path).toBe(relative(process.cwd(), f.ipaPath));
  expect(manifest.archive.path).toBe(relative(process.cwd(), f.archivePath));
});
it.each(['hex-key', 'auth-token', 'userinfo', 'control', 'too-long'])(
  'rejects unsafe DWARF lookup metadata before manifest persistence (%s)',
  async (mode) => {
    const f = fixture();
    const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: f.run });
    const value = {
      'hex-key': 'ab12'.repeat(8),
      'auth-token': f.ctx.token,
      userinfo: 'https://synthetic-key:password@example.test/name',
      control: 'bad\nname',
      'too-long': 'x'.repeat(1025),
    }[mode]!;
    // No lookup occurs: validation must reject before attempting to read this path.
    dsyms[0].exePath = `${f.archivePath}/dSYMs/${value}`;
    await expect(
      stageSymbols({
        archivePath: f.archivePath,
        ipaPath: f.ipaPath,
        outDir: f.outDir,
        run: f.run,
        ctx: f.ctx,
        workDir: f.workDir,
        dsyms,
      }),
    ).rejects.toMatchObject({
      code: 'PREFLIGHT',
    });
    expect(existsSync(join(f.attemptDir(), 'manifest.json'))).toBe(false);
    const receipt = readFileSync(join(f.attemptDir(), 'verification.json'), 'utf8');
    expect(receipt).not.toContain(value);
  },
);

it.each(['My App (Debug).app', 'a@b', 'a+b'])(
  'accepts ordinary dSYM filename characters (%s)',
  async (name) => {
    const f = fixture();
    const dsyms = await inventoryDsyms({ archivePath: f.archivePath, run: f.run });
    const dsym = dsyms[0];
    const path = join(f.archivePath, `dSYMs/${name}.dSYM/Contents/Resources/DWARF/${name}`);
    put(path, readFileSync(dsym.exePath));
    dsym.exePath = path;
    dsym.relPath = `dSYMs/${name}.dSYM`;
    await stageSymbols({
      archivePath: f.archivePath,
      ipaPath: f.ipaPath,
      outDir: f.outDir,
      run: f.run,
      ctx: f.ctx,
      workDir: f.workDir,
      dsyms,
    });
    const manifest = JSON.parse(readFileSync(join(f.attemptDir(), 'manifest.json'), 'utf8'));
    expect(manifest.dsyms[0].dwarfPath).toBe(relative(f.archivePath, path));
  },
);
it('redacts credential assignments in any diagnostic text while retaining validated structured SHA-1', async () => {
  const secret = 'unknown-query-secret';
  for (const field of ['key', 'token', 'sig', 'signature', 'X-Amz-Credential', 'X-Amz-Signature'])
    expect(sanitizeDiagnostic(`diagnostic ${field}=${secret}`, {})).not.toContain(secret);
  expect(sanitizeDiagnostic('9876543210abcdef'.repeat(2), {})).toBe('[redacted]');
  const f = fixture();
  const rows = await queryDebugFiles({
    ctx: f.ctx,
    uuid,
    fetch: f.deps.fetch,
    now: f.now,
    deadlineMs: 10_000,
  });
  expect(rows[0].sha1).toBe(stripped.sha1);
});

it.each([0, 1, 2])('missing original symbols block each required target (%i)', async (index) => {
  const f = fixture();
  const name = ['CherryStudio', 'ExpoWidgetsTarget', 'CherryShareExtension'][index];
  rmSync(join(f.archivePath, 'dSYMs', name + '.dSYM'), { recursive: true });
  await expect(runUploadIosSymbols(f.deps)).rejects.toThrow(REQUIRED_IDENTIFIERS[index]);
  expect(f.commands.some(({ args }) => args.includes('upload'))).toBe(false);
});

it('retains a partial vendor dSYM and records vendor upload failures without failing the app upload', async () => {
  const f = fixture();
  f.addBundle(
    3,
    'com.example.OpenSSL',
    'OpenSSL',
    'CherryStudio.app/Frameworks/OpenSSL.framework',
    otherUuid,
  );
  const path = join(f.archivePath, 'dSYMs/OpenSSL.dSYM/Contents/Resources/DWARF/OpenSSL');
  f.localFeatures.set(path, ['symtab', 'debug']);
  const run: Run = async (cmd, args, options) =>
    args[1] === '--statistics' && args.at(-1) === path
      ? {
          stdout: JSON.stringify({
            '#bytes with line information': 8,
            '#bytes with line-0 locations': 8,
          }),
          exitCode: 0,
        }
      : args.includes('upload') && args.some((arg) => arg.includes('OpenSSL.dSYM'))
        ? { exitCode: 1, stdout: '' }
        : f.run(cmd, args, options);
  await expect(runUploadIosSymbols({ ...f.deps, run })).resolves.toMatchObject({
    kind: 'verified',
    executables: 3,
  });
  expect(f.receipt().thirdPartySymbols).toContainEqual(
    expect.objectContaining({ uuid: otherUuid, coverage: 'limited', upload: 'failed' }),
  );
});

it('retries retained original symbols for the same build after a Sentry outage', async () => {
  const f = fixture();
  f.setUploadExit(23);
  await expect(runUploadIosSymbols(f.deps)).rejects.toMatchObject({ code: 'TOOL_EXIT_23' });
  expect(existsSync(join(f.outDir, 'upload.pending'))).toBe(true);
  const { verifyIosSymbolPackage } =
    require('../verifyIosSymbolPackage') as typeof import('../verifyIosSymbolPackage');
  const deps = {
    archivePath: artifactArchive(f),
    buildId: f.ctx.buildId,
    run: f.run,
    resolveCli: f.deps.resolveCli,
  };
  await expect(verifyIosSymbolPackage(deps)).rejects.toMatchObject({ code: 'PACKAGE_INCOMPLETE' });
  const previous = process.env;
  process.env = {
    ...previous,
    SENTRY_URL: f.ctx.sentryUrl,
    SENTRY_ORG: f.ctx.org,
    SENTRY_PROJECT: f.ctx.project,
    SENTRY_AUTH_TOKEN: f.ctx.token,
    EXPO_PUBLIC_SENTRY_DSN: 'https://other@ingest.example/2',
  };
  const remote = jest.spyOn(globalThis, 'fetch').mockImplementation(f.deps.fetch);
  try {
    await expect(verifyIosSymbolPackage({ ...deps, retryUpload: true })).rejects.toMatchObject({
      code: 'PACKAGE_SENTRY_TARGET',
    });
    expect(remote).not.toHaveBeenCalled();
    f.setUploadExit(0);
    process.env.EXPO_PUBLIC_SENTRY_DSN = f.ctx.dsn;
    await expect(verifyIosSymbolPackage({ ...deps, retryUpload: true })).resolves.toMatchObject({
      status: 'download-verified',
      slices: 3,
      repairedRecords: expect.arrayContaining([expect.objectContaining({ uuid })]),
    });
    expect(remote.mock.calls.filter(([input]) => String(input).includes('debug_id='))).toHaveLength(
      3,
    );
  } finally {
    process.env = previous;
    remote.mockRestore();
  }
});

it('requires real source-line coverage from each Cherry target even if its debug flag is present', async () => {
  const f = fixture();
  const run: Run = (cmd, args, opts) =>
    args[1] === '--statistics' && args.at(-1)?.endsWith('/ExpoWidgetsTarget')
      ? Promise.resolve({
          stdout: JSON.stringify({
            '#bytes with line information': 8,
            '#bytes with line-0 locations': 8,
          }),
          exitCode: 0,
        })
      : f.run(cmd, args, opts);
  await expect(runUploadIosSymbols({ ...f.deps, run })).rejects.toThrow(REQUIRED_IDENTIFIERS[1]);
  expect(f.commands.some(({ args }) => args.includes('upload'))).toBe(false);
});

it.each(['linux', 'darwin'] as const)(
  'runs and records local-build-plugin runner when CHERRY_LOCAL_RELEASE_SYMBOL_GATE is enabled (ambient %s)',
  async (ambientPlatform) => {
    stubPlatform(ambientPlatform);
    const f = fixture();
    const localBuildId = '550e8400-e29b-41d4-a716-446655440000';
    const sourceSha = '1e1bc7acbe0e23dbde016b0e97976f24651c487f';
    const localEnv: NodeJS.ProcessEnv = {
      ...productionEnv(),
      EAS_BUILD_RUNNER: 'local-build-plugin',
      CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
      CHERRY_LOCAL_BUILD_ID: localBuildId,
      CHERRY_SOURCE_SHA: sourceSha,
      EXPO_PUBLIC_SENTRY_DSN: f.ctx.dsn,
      SENTRY_URL: f.ctx.sentryUrl,
    };
    delete localEnv.EAS_BUILD_ID;
    delete localEnv.EAS_BUILD_GIT_COMMIT_HASH;

    const cwd = process.cwd();
    process.chdir(f.project);
    let ctx: ReturnType<typeof resolveBuildContext>;
    try {
      ctx = resolveBuildContext(localEnv);
    } finally {
      process.chdir(cwd);
    }
    expect(ctx.kind).toBe('active');
    if (ctx.kind !== 'active') throw new Error('expected active context');
    expect(ctx.buildId).toBe(localBuildId);
    expect(ctx.sourceSha).toBe(sourceSha);
    expect(ctx.env).toEqual(localEnv);

    if (ambientPlatform === 'linux')
      expect(() => validateBuildContext(ctx)).toThrow('macOS (darwin)');
    stubPlatform('darwin');
    const result = await runUploadIosSymbols({ ...f.deps, ctx });
    expect(result).toMatchObject({ kind: 'verified', executables: 3 });
    expect(f.manifest().runner).toBe('local-build-plugin');
    expect(f.manifest().buildId).toBe(localBuildId);
    expect(f.manifest().sourceSha).toBe(sourceSha);
  },
);

it.each([
  { field: 'CHERRY_LOCAL_BUILD_ID', value: 'not-a-uuid' },
  { field: 'CHERRY_SOURCE_SHA', value: 'short' },
  { field: 'PROFILE', value: 'development' },
])('local release symbol gate fails preflight when $field is invalid', ({ field, value }) => {
  const localEnv: NodeJS.ProcessEnv = {
    ...productionEnv(),
    EAS_BUILD_RUNNER: 'local-build-plugin',
    CHERRY_LOCAL_RELEASE_SYMBOL_GATE: 'true',
    CHERRY_LOCAL_BUILD_ID: '550e8400-e29b-41d4-a716-446655440000',
    CHERRY_SOURCE_SHA: '1e1bc7acbe0e23dbde016b0e97976f24651c487f',
    [field]: value,
  };
  delete localEnv.EAS_BUILD_ID;
  delete localEnv.EAS_BUILD_GIT_COMMIT_HASH;
  expect(() => resolveBuildContext(localEnv)).toThrow();
});
