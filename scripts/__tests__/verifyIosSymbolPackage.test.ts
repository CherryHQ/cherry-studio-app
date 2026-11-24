import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { gzipSync, strToU8, zipSync } from 'fflate';
import { parse } from 'yaml';

import {
  REQUIRED_IDENTIFIERS,
  runCommand,
  resolveSentryCli,
  sentryTargetFingerprint,
  sentryTargetFromEnv,
  type CommandResult,
} from '../uploadIosSymbols';
import { readMachOSlices, verifyIosSymbolPackage } from '../verifyIosSymbolPackage';

jest.mock('../uploadIosSymbols', () =>
  Object.assign(jest.requireActual('../uploadIosSymbols'), {
    runCommand: jest.fn(),
    resolveSentryCli: jest.fn(() => '/native/sentry-cli'),
  }),
);

beforeEach(() => {
  jest.mocked(resolveSentryCli).mockReturnValue('/native/sentry-cli');
  jest.mocked(runCommand).mockImplementation(async (_command, args) => {
    if (args[1] === '--statistics')
      return {
        stdout: JSON.stringify({
          '#bytes with line information': 128,
          '#bytes with line-0 locations': 8,
        }),
        exitCode: 0,
      };
    if (args[0] === 'lipo') {
      const pair = readMachOSlices(readFileSync(args[1])).find((pair) => pair.arch === args[3])!;
      writeFileSync(
        args[5],
        thinMachO({
          id: pair.uuid.replaceAll('-', ''),
          cpuType: pair.arch === 'arm64' ? 0x0100000c : 0x01000007,
          cpuSubtype: pair.arch === 'arm64' ? 0 : 3,
        }),
      );
      return { stdout: '', exitCode: 0 };
    }
    return {
      stdout: JSON.stringify({
        features: 'symtab, debug',
        variants: readMachOSlices(readFileSync(args.at(-1)!)).map((pair) => ({
          debug_id: pair.uuid,
          arch: pair.arch,
        })),
      }),
      exitCode: 0,
    };
  });
});

const uuid = 'c82992fb-86a8-3d5e-847c-bb9132aa9dd3';
const otherUuid = 'aaaaaaaa-1111-2222-3333-444444444444';
const buildId = '0d597a16-b6ff-4429-8e74-aca9960f9e8b';
const roots: string[] = [];
const evidence = (bytes: Uint8Array) => ({
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

// Identity-only Mach-O fixtures; native debug evidence is stubbed independently.
function thinMachO({
  cpuType = 0x0100000c,
  cpuSubtype = 0,
  is64 = true,
  little = true,
  id = 'c82992fb86a83d5e847cbb9132aa9dd3',
} = {}) {
  const headerSize = is64 ? 32 : 28;
  const bytes = Buffer.alloc(headerSize + 24);
  const u32 = (offset: number, value: number) =>
    little ? bytes.writeUInt32LE(value, offset) : bytes.writeUInt32BE(value, offset);
  u32(0, is64 ? 0xfeedfacf : 0xfeedface);
  u32(4, cpuType);
  u32(8, cpuSubtype);
  u32(12, 10); // MH_DSYM
  u32(16, 1);
  u32(20, 24);
  u32(headerSize, 0x1b); // LC_UUID
  u32(headerSize + 4, 24);
  Buffer.from(id, 'hex').copy(bytes, headerSize + 8);
  return bytes;
}
function fatMachO(is64 = false, little = false) {
  const slices = [
    { bytes: thinMachO(), cpuType: 0x0100000c, cpuSubtype: 0 },
    {
      bytes: thinMachO({
        cpuType: 0x01000007,
        cpuSubtype: 3,
        little: false,
        id: 'aaaaaaaa111122223333444444444444',
      }),
      cpuType: 0x01000007,
      cpuSubtype: 3,
    },
  ];
  const recordSize = is64 ? 32 : 20;
  let offset = Math.ceil((8 + slices.length * recordSize) / 8) * 8;
  const bytes = Buffer.alloc(
    offset + slices.reduce((sum, slice) => sum + Math.ceil(slice.bytes.length / 8) * 8, 0),
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(0, is64 ? 0xcafebabf : 0xcafebabe, little);
  view.setUint32(4, slices.length, little);
  slices.forEach((slice, index) => {
    const record = 8 + index * recordSize;
    view.setUint32(record, slice.cpuType, little);
    view.setUint32(record + 4, slice.cpuSubtype, little);
    if (is64) {
      view.setBigUint64(record + 8, BigInt(offset), little);
      view.setBigUint64(record + 16, BigInt(slice.bytes.length), little);
    } else {
      view.setUint32(record + 8, offset, little);
      view.setUint32(record + 12, slice.bytes.length, little);
    }
    view.setUint32(record + (is64 ? 24 : 16), 3, little);
    slice.bytes.copy(bytes, offset);
    offset += Math.ceil(slice.bytes.length / 8) * 8;
  });
  return bytes;
}

function tarArchive(entries: Record<string, Uint8Array>, paxPath?: string) {
  const chunks: Buffer[] = [];
  const add = (name: string, data: Uint8Array, type = '0') => {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.write(
      `${header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0')}\0 `,
      148,
    );
    chunks.push(header, Buffer.from(data), Buffer.alloc((512 - (data.length % 512)) % 512));
  };
  for (const [path, data] of Object.entries(entries)) {
    if (path === paxPath) {
      const record = `path=${path}\n`;
      let length = Buffer.byteLength(record) + 2;
      while (length !== Buffer.byteLength(record) + String(length).length + 1)
        length = Buffer.byteLength(record) + String(length).length + 1;
      add('PaxHeader', strToU8(`${length} ${record}`), 'x');
    }
    add(path === paxPath ? 'short-name' : path, data);
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}

function fixture(dwarf = thinMachO(), identities = [{ uuid, arch: 'arm64' }]) {
  const root = mkdtempSync(join(tmpdir(), 'cherry-symbol-package-test-'));
  roots.push(root);
  const archivePath = join(root, 'buildArtifacts');
  const rootDir = 'ios/build/ios-symbols';
  const dir = `${rootDir}/package-test`;
  const dwarfPath = 'dSYMs/Tiny.dSYM/Contents/Resources/DWARF/Tiny';
  const symbols: Record<string, Uint8Array> = { [dwarfPath]: dwarf };
  const artifacts: Record<string, Uint8Array> = { [`${dir}/dsyms.zip`]: zipSync(symbols) };
  artifacts[`${rootDir}/package.complete`] = strToU8(JSON.stringify({ directory: 'package-test' }));
  artifacts[`${dir}/archive-info.plist`] = strToU8('<plist>archive identity</plist>');
  const manifest = {
    archive: { infoPlist: evidence(artifacts[`${dir}/archive-info.plist`]) },
    schemaVersion: 1,
    buildId,
    inventoryStatus: 'inspected',
    bundles: [
      { identifier: REQUIRED_IDENTIFIERS[0], uuids: identities.map((pair) => ({ ...pair })) },
    ],
    dsyms: [{ dwarfPath, uuids: identities.map((pair) => ({ ...pair })), ...evidence(dwarf) }],
    symbolPackage: { filename: 'dsyms.zip', ...evidence(artifacts[`${dir}/dsyms.zip`]) },
  };
  for (const [index, id] of [
    'bbbbbbbb-1111-2222-3333-444444444444',
    'cccccccc-1111-2222-3333-444444444444',
  ].entries()) {
    const dwarfPath = `dSYMs/Extension${index}.dSYM/Contents/Resources/DWARF/Extension${index}`;
    const bytes = thinMachO({ id: id.replaceAll('-', '') });
    symbols[dwarfPath] = bytes;
    const uuids = [{ uuid: id, arch: 'arm64' }];
    manifest.bundles.push({ identifier: REQUIRED_IDENTIFIERS[index + 1], uuids });
    manifest.dsyms.push({ dwarfPath, uuids, ...evidence(bytes) });
  }
  const receipt = {
    schemaVersion: 1,
    buildId,
    manifestSha256: '',
    preflight: { status: 'passed' },
    upload: { status: 'passed' },
    remoteVerification: { status: 'passed' },
    records: manifest.bundles.flatMap((bundle) =>
      bundle.uuids.map((pair) => ({
        ...pair,
        id: '123',
        symbolType: 'macho',
        features: ['debug'],
      })),
    ),
    failure: null,
  };
  const pack = () => writeFileSync(archivePath, zipSync(artifacts));
  function save() {
    artifacts[`${dir}/manifest.json`] = strToU8(JSON.stringify(manifest));
    receipt.manifestSha256 = evidence(artifacts[`${dir}/manifest.json`]).sha256;
    artifacts[`${dir}/verification.json`] = strToU8(JSON.stringify(receipt));
    pack();
  }
  function saveSymbols() {
    artifacts[`${dir}/dsyms.zip`] = zipSync(symbols);
    Object.assign(manifest.symbolPackage, evidence(artifacts[`${dir}/dsyms.zip`]));
    save();
  }
  saveSymbols();
  return {
    root,
    archivePath,
    dir,
    dwarfPath,
    symbols,
    artifacts,
    manifest,
    receipt,
    pack,
    save,
    saveSymbols,
    deps: { archivePath, buildId, now: () => 0 },
  };
}
afterEach(() => {
  jest.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each(['success', 'missing-symbols', 'verify-failed', 'submit-failed'])(
  'submission checks the local symbol directory before eas submit --path (%s)',
  (scenario) => {
    const root = mkdtempSync(join(tmpdir(), 'cherry-workflow-test-'));
    roots.push(root);
    const log = join(root, 'calls');
    const symbolsDir = join(root, 'ios-symbols');
    const archiveDir = join(root, 'archive');
    const ipaPath = join(archiveDir, 'cherry-studio-0.6.2-ios.ipa');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(ipaPath, 'ipa-bytes');
    if (scenario !== 'missing-symbols') {
      mkdirSync(symbolsDir, { recursive: true });
      writeFileSync(join(symbolsDir, 'package.complete'), '{"directory":"package-test"}');
    }
    const stub = (name: string, script: string) =>
      writeFileSync(join(root, name), '#!/bin/bash\nset -eu\n' + script, { mode: 0o700 });
    stub(
      'node',
      `if [[ "$1 $2" == "--import tsx" && "$3" == "scripts/verifyIosSymbolPackage.ts" ]]; then
  echo verify >> "$CALLS"
  if [[ "$SCENARIO" == missing-symbols && ! -d "$4" ]]; then exit 1; fi
  if [[ "$SCENARIO" == verify-failed ]]; then exit 1; fi
  echo '{"slices":3,"thirdPartySymbols":[]}'
  exit 0
fi
if [[ "$1 $2" == "--import tsx" && "$3" == "scripts/releaseLocalBuild.ts" && "$4" == "record-submit" ]]; then
  echo "record-\${10}" >> "$CALLS"
  exit 0
fi
exit 2`,
    );
    stub(
      'pnpm',
      `[[ "$1 $2 $3 $4 $5 $6 $7 $8" == "exec eas submit --platform ios --profile production --path" && "$9" == "$IOS_IPA_PATH" ]] || exit 2
echo submit >> "$CALLS"
if [[ "$SCENARIO" == submit-failed ]]; then exit 1; fi`,
    );
    const repo = resolve(__dirname, '../..');
    const workflow = parse(readFileSync(join(repo, '.github/workflows/release.yml'), 'utf8'));
    expect(workflow.jobs['submit-ios']).toBeDefined();
    const stepNames = workflow.jobs['submit-ios'].steps.map((step: { name: string }) => step.name);
    expect(stepNames.indexOf('Verify archived iOS IPA integrity')).toBeGreaterThan(-1);
    expect(stepNames.indexOf('Verify archived iOS IPA integrity')).toBeLessThan(
      stepNames.indexOf('Verify local iOS symbols'),
    );
    const steps = workflow.jobs['submit-ios'].steps.filter(
      (step: { run?: string }) =>
        step.run?.includes('verifyIosSymbolPackage.ts') ||
        step.run?.includes('eas submit --platform ios'),
    );
    expect(steps.map((step: { name: string }) => step.name)).toEqual([
      'Verify local iOS symbols',
      'Submit this build and wait for upload',
    ]);
    const result = spawnSync(
      'bash',
      ['-eo', 'pipefail', '-c', steps.map((step: { run: string }) => step.run).join('\n')],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: root + ':' + process.env.PATH,
          RUNNER_TEMP: root,
          IOS_BUILD_ID: buildId,
          IOS_SYMBOLS_DIR: symbolsDir,
          IOS_ARCHIVE_DIR: archiveDir,
          IOS_IPA_PATH: ipaPath,
          GITHUB_STEP_SUMMARY: join(root, 'summary'),
          CALLS: log,
          SCENARIO: scenario,
        },
      },
    );
    expect(result.status === 0).toBe(scenario === 'success');
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    expect(calls).toEqual(
      scenario === 'success'
        ? ['verify', 'submit', 'record-succeeded']
        : scenario === 'submit-failed'
          ? ['verify', 'submit', 'record-failed']
          : ['verify'],
    );
  },
);

it('reads a literal MH_MAGIC_64/LC_UUID fixture with an independently known UUID', () => {
  const bytes = Buffer.from(
    'cffaedfe0c000001000000000a00000001000000180000000000000000000000' +
      '1b00000018000000c82992fb86a83d5e847cbb9132aa9dd3',
    'hex',
  );
  expect(readMachOSlices(bytes)).toEqual([{ uuid, arch: 'arm64' }]);
});
it.each([true, false])(
  'reads thin 32/64-bit headers, UUID bytes and CPU subtypes (little=%s)',
  (little) => {
    const cases: [number, number, boolean, string][] = [
      [0x0100000c, 0, true, 'arm64'],
      [0x0100000c, 1, true, 'arm64'],
      [0x0100000c, 0x80000002, true, 'arm64e'],
      [0x01000007, 3, true, 'x86_64'],
      [0x01000007, 0x80000003, true, 'x86_64'],
      [0x01000007, 8, true, 'x86_64h'],
      [7, 3, false, 'i386'],
      [12, 0, false, 'arm'],
      [12, 5, false, 'armv4t'],
      [12, 6, false, 'armv6'],
      [12, 7, false, 'armv5'],
      [12, 8, false, 'xscale'],
      [12, 9, false, 'armv7'],
      [12, 10, false, 'armv7f'],
      [12, 11, false, 'armv7s'],
      [12, 12, false, 'armv7k'],
    ];
    for (const [cpuType, cpuSubtype, is64, arch] of cases)
      expect(readMachOSlices(thinMachO({ cpuType, cpuSubtype, is64, little }))).toEqual([
        { uuid: 'c82992fb-86a8-3d5e-847c-bb9132aa9dd3', arch },
      ]);
  },
);
it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  'reads fat headers and every independently endian slice (fat64=%s, little=%s)',
  (is64, little) => {
    expect(readMachOSlices(fatMachO(is64, little))).toEqual([
      { uuid: 'c82992fb-86a8-3d5e-847c-bb9132aa9dd3', arch: 'arm64' },
      { uuid: 'aaaaaaaa-1111-2222-3333-444444444444', arch: 'x86_64' },
    ]);
  },
);
it.each([
  'magic',
  'header',
  'commands',
  'zero-command',
  'uuid-size',
  'no-uuid',
  'nil-uuid',
  'cpu',
  'subtype',
])('rejects unreadable or unsupported thin Mach-O (%s)', (mode) => {
  let bytes = thinMachO();
  const command = 32;
  if (mode === 'magic') bytes.writeUInt32LE(0, 0);
  if (mode === 'header') bytes = bytes.subarray(0, 20);
  if (mode === 'commands') bytes.writeUInt32LE(0xffffffff, 20);
  if (mode === 'zero-command') bytes.writeUInt32LE(0, 36);
  if (mode === 'uuid-size') bytes.writeUInt32LE(16, command + 4);
  if (mode === 'no-uuid') bytes.writeUInt32LE(0x2a, command);
  if (mode === 'nil-uuid') bytes.fill(0, command + 8, command + 24);
  if (mode === 'cpu') bytes.writeUInt32LE(0x12345678, 4);
  if (mode === 'subtype') bytes.writeUInt32LE(99, 8);
  expect(() => readMachOSlices(bytes)).toThrow(
    expect.objectContaining({ code: 'PACKAGE_DSYM_INSPECTION' }),
  );
});
it.each(['table', 'slice-range', 'cpu-mismatch', 'overlap', 'missing-uuid', 'fat64-overflow'])(
  'rejects malformed fat Mach-O (%s)',
  (mode) => {
    const bytes = fatMachO(mode === 'fat64-overflow');
    if (mode === 'table') bytes.writeUInt32BE(0xffffffff, 4);
    if (mode === 'slice-range') bytes.writeUInt32BE(bytes.length, 16);
    if (mode === 'cpu-mismatch') bytes.writeUInt32BE(7, 8);
    if (mode === 'overlap') bytes.writeUInt32BE(bytes.readUInt32BE(16), 36);
    if (mode === 'missing-uuid') {
      const second = bytes.readUInt32BE(36);
      bytes.writeUInt32BE(0x2a, second + 32);
    }
    if (mode === 'fat64-overflow') bytes.writeBigUInt64BE(0xffffffffffffffffn, 16);
    expect(() => readMachOSlices(bytes)).toThrow(
      expect.objectContaining({ code: 'PACKAGE_DSYM_INSPECTION' }),
    );
  },
);
it('verifies the build, checksums and identities using pinned native CLI debug evidence', async () => {
  const f = fixture();
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toEqual({
    status: 'download-verified',
    buildId,
    archivePath: resolve(f.archivePath),
    manifestSha256: f.receipt.manifestSha256,
    symbolPackage: evidence(f.artifacts[`${f.dir}/dsyms.zip`]),
    slices: 3,
    thirdPartySymbols: [],
    verifiedAt: '1970-01-01T00:00:00.000Z',
    expiry: 'unknown',
  });
  expect(runCommand).toHaveBeenCalledWith(
    '/native/sentry-cli',
    ['debug-files', 'check', '--json', expect.any(String)],
    { timeoutMs: expect.any(Number) },
  );
  const extracted = jest.mocked(runCommand).mock.calls.at(-1)![1].at(-1)!;
  expect(require('node:fs').existsSync(extracted)).toBe(false);
});
it('verifies every UUID and architecture in a nested ZIP containing a fat dSYM', async () => {
  const f = fixture(fatMachO(true, true), [
    { uuid, arch: 'arm64' },
    { uuid: otherUuid, arch: 'x86_64' },
  ]);
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({ slices: 4 });
});
it('does not let a full-debug fat slice cover a stripped sibling', async () => {
  const f = fixture(fatMachO(), [
    { uuid, arch: 'arm64' },
    { uuid: otherUuid, arch: 'x86_64' },
  ]);
  const originalRun = jest.mocked(runCommand).getMockImplementation()!;
  jest.mocked(runCommand).mockImplementation(async (command, args, options) => {
    const result = await originalRun(command, args, options);
    if (args[0] === 'debug-files') {
      const info = JSON.parse(result.stdout);
      if (info.variants[0].arch === 'x86_64') info.features = 'symtab, unwind';
      result.stdout = JSON.stringify(info);
    }
    return result;
  });
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_UUID_COVERAGE',
  });
});
it.each(['tar', 'gzip', 'pax'])(
  'reads %s buildArtifacts without assuming a filename extension',
  async (format) => {
    const f = fixture();
    const tar = tarArchive(f.artifacts, format === 'pax' ? `${f.dir}/manifest.json` : undefined);
    writeFileSync(f.archivePath, format === 'gzip' ? gzipSync(tar) : tar);
    await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({ slices: 3 });
  },
);
it.each(['manifest', 'receipt'])('rejects a different %s build ID', async (file) => {
  const f = fixture();
  if (file === 'manifest') f.manifest.buildId = otherUuid;
  else f.receipt.buildId = otherUuid;
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({ code: 'PACKAGE_BUILD_ID' });
});
it('rejects a manifest changed after the receipt checksum was recorded', async () => {
  const f = fixture();
  f.artifacts[`${f.dir}/manifest.json`] = strToU8(
    JSON.stringify({ ...f.manifest, sourceSha: 'changed' }),
  );
  f.pack();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_MANIFEST_SHA256',
  });
});
it.each(['size', 'sha256'])('rejects a dsyms.zip %s mismatch', async (field) => {
  const f = fixture();
  const bytes = f.artifacts[`${f.dir}/dsyms.zip`];
  f.artifacts[`${f.dir}/dsyms.zip`] =
    field === 'size' ? bytes.subarray(0, 10) : new Uint8Array(bytes.length);
  f.pack();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: field === 'size' ? 'PACKAGE_SYMBOLS_SIZE' : 'PACKAGE_SYMBOLS_SHA256',
  });
});
it('rejects pending or failed hook evidence', async () => {
  const f = fixture();
  f.receipt.remoteVerification.status = 'failed';
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_GATE_STATUS',
  });
  f.receipt.remoteVerification.status = 'passed';
  f.manifest.inventoryStatus = 'pending';
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({ code: 'PACKAGE_SCHEMA' });
});
it.each(['image', 'dsym', 'architecture'])(
  'rejects an absent manifest UUID/architecture pair (%s)',
  async (mode) => {
    const f = fixture();
    if (mode === 'image') f.manifest.bundles[0].uuids.push({ uuid: otherUuid, arch: 'arm64e' });
    if (mode === 'dsym') f.manifest.dsyms[0].uuids.push({ uuid: otherUuid, arch: 'arm64e' });
    if (mode === 'architecture') f.manifest.bundles[0].uuids[0].arch = 'x86_64';
    f.save();
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toThrow(
      expect.objectContaining({
        code: 'PACKAGE_UUID_COVERAGE',
        message: expect.stringContaining(
          mode === 'architecture' ? `${uuid}/x86_64` : `${otherUuid}/arm64e`,
        ),
      }),
    );
  },
);
it('rejects wrong UUIDs even with matching checksums', async () => {
  const f = fixture(thinMachO({ id: 'aaaaaaaa111122223333444444444444' }));
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_UUID_COVERAGE',
  });
});
it.each(['missing', 'bytes', 'path', 'absolute'])(
  'rejects missing/corrupted original DWARF and unsafe paths (%s)',
  async (mode) => {
    const f = fixture();
    if (mode === 'missing')
      f.manifest.dsyms[0].dwarfPath = 'dSYMs/Missing.dSYM/Contents/Resources/DWARF/Missing';
    if (mode === 'bytes')
      f.symbols[f.dwarfPath] = thinMachO({ id: 'aaaaaaaa111122223333444444444444' });
    if (mode === 'path') f.manifest.dsyms[0].dwarfPath = '../outside';
    if (mode === 'absolute') f.manifest.dsyms[0].dwarfPath = '/outside';
    f.saveSymbols();
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
      code:
        mode === 'missing'
          ? 'PACKAGE_DWARF_MISSING'
          : mode === 'bytes'
            ? 'PACKAGE_DWARF_SHA256'
            : 'PACKAGE_DWARF_PATH',
    });
  },
);
it.each(['directory', 'duplicate', 'json', 'symbols'])(
  'rejects absent/ambiguous recovery data (%s)',
  async (mode) => {
    const f = fixture();
    if (mode === 'directory') for (const path of Object.keys(f.artifacts)) delete f.artifacts[path];
    if (mode === 'duplicate') f.artifacts['duplicate/ios-symbols/'] = new Uint8Array();
    if (mode === 'json') f.artifacts[`${f.dir}/manifest.json`] = strToU8('not JSON');
    if (mode === 'symbols') delete f.artifacts[`${f.dir}/dsyms.zip`];
    f.pack();
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
      code:
        mode === 'directory' || mode === 'duplicate'
          ? 'PACKAGE_DIRECTORY'
          : mode === 'json'
            ? 'PACKAGE_JSON'
            : 'PACKAGE_SYMBOLS_MISSING',
    });
  },
);
it('ignores AppleDouble copies in the outer archive', async () => {
  const f = fixture();
  f.artifacts['__MACOSX/ios-symbols/manifest.json'] = strToU8('invalid');
  f.pack();
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({ slices: 3 });
});
it('rejects a missing archive and invalid outer/nested ZIPs with specific codes', async () => {
  const f = fixture();
  await expect(
    verifyIosSymbolPackage({ ...f.deps, archivePath: join(f.root, 'absent') }),
  ).rejects.toMatchObject({ code: 'PACKAGE_ARCHIVE_MISSING' });
  writeFileSync(f.archivePath, 'PK invalid ZIP');
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_EXTRACTION',
  });
  f.artifacts[`${f.dir}/dsyms.zip`] = strToU8('invalid ZIP');
  Object.assign(f.manifest.symbolPackage, evidence(f.artifacts[`${f.dir}/dsyms.zip`]));
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_SYMBOLS_EXTRACTION',
  });
});
it('rejects malformed Mach-O bytes inside a real nested ZIP', async () => {
  const f = fixture(Buffer.from('not a Mach-O file'));
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_DSYM_INSPECTION',
  });
});
it('malformed slice lists fail closed', async () => {
  const f = fixture();
  f.manifest.bundles[0].uuids = [];
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({ code: 'PACKAGE_SCHEMA' });
});

it.each(['missing', 'corrupt', 'hash'])(
  'requires checksummed archive-info.plist (%s)',
  async (mode) => {
    const f = fixture();
    if (mode === 'missing') delete f.artifacts[`${f.dir}/archive-info.plist`];
    if (mode === 'corrupt') f.artifacts[`${f.dir}/archive-info.plist`] = strToU8('corrupted');
    if (mode === 'hash') f.manifest.archive.infoPlist.sha256 = '0'.repeat(64);
    if (mode === 'hash') f.save();
    else f.pack();
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
      code: mode === 'missing' ? 'PACKAGE_PLIST_MISSING' : 'PACKAGE_PLIST_SHA256',
    });
  },
);
it.each(['missing', 'unsafe', 'unfinished'])(
  'requires a complete publication pointer (%s)',
  async (mode) => {
    const f = fixture();
    const marker = 'ios/build/ios-symbols/package.complete';
    if (mode === 'missing') delete f.artifacts[marker];
    if (mode === 'unsafe')
      f.artifacts[marker] = strToU8(JSON.stringify({ directory: '../outside' }));
    if (mode === 'unfinished')
      f.artifacts[marker] = strToU8(JSON.stringify({ directory: 'package-unfinished' }));
    f.pack();
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
      code: mode === 'unfinished' ? 'PACKAGE_JSON' : 'PACKAGE_INCOMPLETE',
    });
  },
);
it('retains and checksums unrelated dSYM bytes without gating on their architecture or debug info', async () => {
  const f = fixture();
  const dwarfPath = 'dSYMs/Unrelated.dSYM/Contents/Resources/DWARF/Unrelated';
  const dwarf = thinMachO({ id: otherUuid.replaceAll('-', '') });
  f.symbols[dwarfPath] = dwarf;
  f.manifest.dsyms.push({
    dwarfPath,
    uuids: [{ uuid: otherUuid, arch: 'arm64' }],
    ...evidence(dwarf),
  });
  f.saveSymbols();
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({
    status: 'download-verified',
    slices: 3,
  });
  f.manifest.dsyms[3].uuids[0].arch = 'unreviewed-vendor-arch';
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({
    status: 'download-verified',
  });
  f.manifest.dsyms[3].sha256 = '0'.repeat(64);
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_DWARF_SHA256',
  });
});
it('ignores an unfinished replacement while verifying the published complete package', async () => {
  const f = fixture();
  f.artifacts['ios/build/ios-symbols/package-unfinished/manifest.json'] = strToU8('partial');
  f.pack();
  await expect(verifyIosSymbolPackage(f.deps)).resolves.toMatchObject({
    status: 'download-verified',
  });
});

it.each([
  ['symtab, unwind', uuid, 'arm64'],
  ['debugger', uuid, 'arm64'],
  ['debug', otherUuid, 'arm64'],
  ['debug', uuid, 'x86_64'],
])(
  'rejects CLI evidence without debug for the required object (%s/%s/%s)',
  async (features, debug_id, arch) => {
    const f = fixture();
    jest.mocked(runCommand).mockResolvedValue({
      stdout: JSON.stringify({ features, variants: [{ debug_id, arch }] }),
      exitCode: 0,
    });
    await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
      code: 'PACKAGE_UUID_COVERAGE',
    });
  },
);
it.each<CommandResult>([
  { stdout: '', exitCode: null, spawnError: 'ENOENT' },
  { stdout: '', exitCode: null, spawnError: 'EACCES' },
  { stdout: '', exitCode: 1 },
  { stdout: '', exitCode: 0, signal: 'SIGTERM' },
  { stdout: '', exitCode: 0, timedOut: true },
  { stdout: 'not JSON', exitCode: 0 },
])('rejects missing or unusable CLI evidence (%j)', async (result) => {
  const f = fixture();
  jest.mocked(runCommand).mockResolvedValue(result);
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_DEBUG_INSPECTION',
  });
});
it('fails when the pinned binary cannot be resolved', async () => {
  const f = fixture();
  jest.mocked(resolveSentryCli).mockImplementation(() => {
    throw new Error('missing binary');
  });
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_VERIFICATION_FAILED',
  });
});

it.each(['success', 'error'])('redacts actual verifier CLI %s output', async (mode) => {
  const f = fixture();
  const key = 'ab12'.repeat(8);
  const token = 'synthetic-verifier-auth-token';
  const dsn = `https://${key}:syntheticDsnPassword@ingest.example/1`;
  const querySecret = 'synthetic-query-secret';
  const unknownKey = '9876543210abcdef'.repeat(2);
  const normalizedSecret = 'normalized-query-secret';
  const previousArgv = process.argv;
  const previousEnv = process.env;
  const previousExitCode = process.exitCode;
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    process.env = { ...process.env, EXPO_PUBLIC_SENTRY_DSN: dsn, SENTRY_AUTH_TOKEN: token };
    let path = join(f.root, `${key}-${token}-${unknownKey}`);
    if (mode === 'error') {
      f.manifest.dsyms[0].dwarfPath = `missing ${dsn} ${key} syntheticDsnPassword ${token} https://example.test/?secret=${querySecret} ${unknownKey} https:/host/path?token=${normalizedSecret}`;
      f.save();
    }
    writeFileSync(path, readFileSync(f.archivePath));
    process.argv = ['node', 'verifyIosSymbolPackage.ts', path, buildId];
    jest.isolateModules(() => {
      require('../verifyIosSymbolPackage');
    });
    await new Promise(setImmediate);
    const output = (mode === 'success' ? log : error).mock.calls.flat().join('\n');
    expect(output).toContain(mode === 'success' ? 'download-verified' : 'PACKAGE_DWARF_MISSING');
    expect(output).toContain('[redacted]');
    for (const secret of [
      key,
      token,
      dsn,
      'syntheticDsnPassword',
      querySecret,
      unknownKey,
      ...(mode === 'error' ? [normalizedSecret] : []),
    ])
      expect(output).not.toContain(secret);
    if (mode === 'error') expect(output).not.toContain('?secret=');
    expect(process.exitCode).toBe(mode === 'error' ? 1 : previousExitCode);
  } finally {
    process.argv = previousArgv;
    process.env = previousEnv;
    process.exitCode = previousExitCode;
  }
});

it('rejects missing required target and remote evidence after download', async () => {
  const f = fixture();
  f.receipt.records.pop();
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toMatchObject({
    code: 'PACKAGE_REMOTE_COVERAGE',
  });
  f.manifest.bundles.pop();
  f.save();
  await expect(verifyIosSymbolPackage(f.deps)).rejects.toThrow(REQUIRED_IDENTIFIERS[2]);
});

it('verifies a local ios-symbols directory, rejects tampered files or symlinks, and repairs pending uploads', async () => {
  const f = fixture();
  const symbolsDir = join(f.root, 'local-ios-symbols');
  const writeDirectoryFromArtifacts = () => {
    rmSync(symbolsDir, { recursive: true, force: true });
    for (const [entryPath, bytes] of Object.entries(f.artifacts)) {
      const rel = entryPath.replace(/^ios\/build\/ios-symbols\//, '');
      const fullPath = join(symbolsDir, rel);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, bytes);
    }
  };
  writeDirectoryFromArtifacts();

  await expect(verifyIosSymbolPackage({ archivePath: symbolsDir, buildId })).resolves.toMatchObject(
    {
      status: 'download-verified',
      buildId,
      slices: 3,
    },
  );

  // Tampering dsyms.zip on disk with identical byte size must fail checksum verification.
  const origZip = readFileSync(join(symbolsDir, 'package-test', 'dsyms.zip'));
  writeFileSync(join(symbolsDir, 'package-test', 'dsyms.zip'), Buffer.alloc(origZip.length, 0x41));
  await expect(verifyIosSymbolPackage({ archivePath: symbolsDir, buildId })).rejects.toMatchObject({
    code: 'PACKAGE_SYMBOLS_SHA256',
  });

  // Symlinks inside the local symbols directory are rejected.
  writeDirectoryFromArtifacts();
  symlinkSync('/etc/passwd', join(symbolsDir, 'package-test', 'escape-link'));
  await expect(verifyIosSymbolPackage({ archivePath: symbolsDir, buildId })).rejects.toMatchObject({
    code: 'PACKAGE_EXTRACTION',
  });

  // Pending directory upload can be repaired directly via --retry-upload semantics.
  rmSync(symbolsDir, { recursive: true, force: true });
  const pendingDir = join(symbolsDir, 'attempt-pending1');
  mkdirSync(pendingDir, { recursive: true });
  writeFileSync(
    join(symbolsDir, 'upload.pending'),
    JSON.stringify({ directory: 'attempt-pending1' }),
  );
  for (const name of ['dsyms.zip', 'archive-info.plist']) {
    writeFileSync(join(pendingDir, name), f.artifacts[`${f.dir}/${name}`]!);
  }
  const previousEnv = process.env;
  process.env = {
    ...previousEnv,
    SENTRY_URL: 'https://sentry.io/',
    SENTRY_ORG: 'cherryai',
    SENTRY_PROJECT: 'cherry-studio-app',
    SENTRY_AUTH_TOKEN: 'synthetic-token',
    EXPO_PUBLIC_SENTRY_DSN: 'https://public@ingest.example/1',
  };
  (f.manifest as Record<string, unknown>).sentryTarget = sentryTargetFingerprint(
    sentryTargetFromEnv(process.env),
  );
  f.receipt.upload = { status: 'failed' };
  f.receipt.remoteVerification = { status: 'pending' };
  f.receipt.records = [];
  f.save();
  writeFileSync(join(pendingDir, 'manifest.json'), f.artifacts[`${f.dir}/manifest.json`]!);
  writeFileSync(join(pendingDir, 'verification.json'), JSON.stringify(f.receipt));
  const remoteFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/keys/')) {
      return new Response(
        JSON.stringify([{ isActive: true, dsn: { public: 'https://public@ingest.example/1' } }]),
      );
    }
    const debugId = url.searchParams.get('debug_id');
    if (debugId) {
      return new Response(
        JSON.stringify([
          {
            id: '789',
            uuid: debugId,
            debugId,
            cpuName: 'arm64',
            symbolType: 'macho',
            objectName: 'Target',
            codeId: null,
            headers: {},
            size: 100,
            sha1: 'a'.repeat(40),
            dateCreated: '2026-11-23T00:00:00Z',
            data: { features: ['symtab', 'debug'] },
          },
        ]),
      );
    }
    return new Response(JSON.stringify({ id: '1' }));
  });
  try {
    await expect(
      verifyIosSymbolPackage({ archivePath: symbolsDir, buildId, retryUpload: true, now: () => 0 }),
    ).resolves.toMatchObject({ status: 'download-verified', slices: 3 });
  } finally {
    process.env = previousEnv;
    remoteFetch.mockRestore();
  }
});
