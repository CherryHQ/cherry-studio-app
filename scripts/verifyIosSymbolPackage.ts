// macOS verifier: use the repository-pinned @sentry/cli native binary for local debug evidence.
// Archive/identity/checksum checks stay in-process; no Sentry endpoint is contacted.
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix, relative, resolve } from 'node:path';

import { gunzipSync, unzipSync } from 'fflate';

import {
  checked,
  requiredIosBundles,
  sentryTargetFromEnv,
  sentryTargetFingerprint,
  queryDebugFiles,
  uploadSymbolFiles,
  waitForRemoteDebug,
  VERIFICATION_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  inspectDsymSlice,
  GateError,
  resolveSentryCli,
  runCommand,
  sanitizeDiagnostic,
  type Run,
  type UuidArch,
} from './uploadIosSymbols';

function requirePackage(condition: unknown, code: string, message = code): asserts condition {
  if (!condition) throw new GateError(code, message);
}
const evidence = (bytes: Uint8Array) => ({
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

// Read archives in memory; native checks write selected objects to fixed scratch filenames.
function readArchive(bytes: Uint8Array, code: string, zipOnly = false): Map<string, Uint8Array> {
  try {
    const entries = new Map<string, Uint8Array>();
    const add = (name: string, data: Uint8Array) => {
      requirePackage(
        !name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'),
        code,
      );
      const path = posix.normalize(name);
      requirePackage(!entries.has(path), code, `Duplicate archive entry: ${path}`);
      entries.set(path, data);
    };
    if (zipOnly || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      for (const [name, data] of Object.entries(unzipSync(bytes))) add(name, data);
    } else {
      // EAS also serves tar/gzip buildArtifacts. Parse regular ustar/PAX entries in-process.
      const tar = Buffer.from(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes);
      let nextPath: string | undefined;
      let ended = false;
      for (let offset = 0; offset + 512 <= tar.length;) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) {
          ended = true;
          break;
        }
        const text = (start: number, length: number) =>
          header
            .subarray(start, start + length)
            .toString('utf8')
            .replace(/\0.*$/s, '');
        const octal = (value: string) => {
          requirePackage(/^[0-7]+$/.test(value.trim()), code);
          return Number.parseInt(value.trim(), 8);
        };
        const checksum = header.reduce(
          (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
          0,
        );
        requirePackage(checksum === octal(text(148, 8)), code);
        const size = octal(text(124, 12));
        requirePackage(Number.isSafeInteger(size) && offset + 512 + size <= tar.length, code);
        const data = tar.subarray(offset + 512, offset + 512 + size);
        const type = text(156, 1);
        if (type === 'x' || type === 'g') {
          for (let position = 0; position < data.length;) {
            const space = data.indexOf(32, position);
            requirePackage(space > position, code);
            const length = Number(data.subarray(position, space).toString());
            requirePackage(
              Number.isSafeInteger(length) &&
                length > space - position + 1 &&
                position + length <= data.length &&
                data[position + length - 1] === 10,
              code,
            );
            const record = data.subarray(space + 1, position + length - 1).toString();
            // Global PAX path/size overrides and sparse files are not regular artifact files.
            requirePackage(!record.startsWith('size=') && !record.startsWith('GNU.sparse.'), code);
            if (record.startsWith('path=')) {
              requirePackage(type === 'x', code);
              nextPath = record.slice(5);
            }
            position += length;
          }
        } else if (type === 'L') {
          nextPath = data.toString('utf8').replace(/\0.*$/s, '');
        } else {
          requirePackage(type === '' || type === '0' || type === '5', code);
          const prefix = text(345, 155);
          const name = nextPath ?? (prefix ? `${prefix}/${text(0, 100)}` : text(0, 100));
          add(type === '5' && !name.endsWith('/') ? `${name}/` : name, data);
          nextPath = undefined;
        }
        offset += 512 + Math.ceil(size / 512) * 512;
      }
      requirePackage(ended && nextPath === undefined, code);
    }
    return entries;
  } catch (error) {
    throw error instanceof GateError ? error : new GateError(code, 'Cannot read archive');
  }
}

function readJson(entries: Map<string, Uint8Array>, path: string) {
  try {
    return JSON.parse(Buffer.from(entries.get(path)!).toString('utf8'));
  } catch {
    throw new GateError('PACKAGE_JSON', `Missing or invalid ${basename(path)}`);
  }
}

function architecture(cpuType: number, cpuSubtype: number): string {
  const subtype = cpuSubtype & 0x00ffffff; // Strip CPU_SUBTYPE_MASK capability bits.
  if (cpuType === 0x0100000c && subtype <= 2) return subtype === 2 ? 'arm64e' : 'arm64';
  if (cpuType === 0x01000007 && (subtype === 3 || subtype === 8))
    return subtype === 8 ? 'x86_64h' : 'x86_64';
  if (cpuType === 7 && subtype === 3) return 'i386';
  if (cpuType === 12) {
    const arm: Record<number, string> = {
      0: 'arm',
      5: 'armv4t',
      6: 'armv6',
      7: 'armv5',
      8: 'xscale',
      9: 'armv7',
      10: 'armv7f',
      11: 'armv7s',
      12: 'armv7k',
    };
    if (arm[subtype]) return arm[subtype];
  }
  throw new GateError('PACKAGE_DSYM_INSPECTION', `Unknown Mach-O CPU: ${cpuType}/${subtype}`);
}

/** Mach-O layout: Apple's mach-o/loader.h, mach-o/fat.h and mach/machine.h. */
export function readMachOSlices(bytes: Uint8Array): UuidArch[] {
  const code = 'PACKAGE_DSYM_INSPECTION';
  const readThin = (data: Uint8Array): UuidArch => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const magic = view.getUint32(0);
    requirePackage([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic), code);
    const little = magic === 0xcefaedfe || magic === 0xcffaedfe;
    const is64 = magic === 0xfeedfacf || magic === 0xcffaedfe;
    const u32 = (offset: number) => view.getUint32(offset, little);
    const headerSize = is64 ? 32 : 28;
    requirePackage(data.length >= headerSize, code);
    const arch = architecture(u32(4), u32(8));
    const count = u32(16);
    const end = headerSize + u32(20);
    requirePackage(end <= data.length && count <= (end - headerSize) / 8, code);
    let offset = headerSize;
    let uuid: string | undefined;
    for (let index = 0; index < count; index++) {
      requirePackage(offset + 8 <= end, code);
      const command = u32(offset);
      const size = u32(offset + 4);
      requirePackage(size >= 8 && size % (is64 ? 8 : 4) === 0 && offset + size <= end, code);
      if (command === 0x1b) {
        // LC_UUID
        requirePackage(size === 24 && uuid === undefined, code);
        const hex = Buffer.from(data.subarray(offset + 8, offset + 24)).toString('hex');
        requirePackage(hex !== '00000000000000000000000000000000', code);
        uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
      offset += size;
    }
    requirePackage(
      offset === end && uuid !== undefined,
      code,
      'Missing LC_UUID or invalid load commands',
    );
    return { uuid, arch };
  };
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = view.getUint32(0);
    if (![0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) return [readThin(bytes)];
    const little = magic === 0xbebafeca || magic === 0xbfbafeca;
    const is64 = magic === 0xcafebabf || magic === 0xbfbafeca;
    const count = view.getUint32(4, little);
    const recordSize = is64 ? 32 : 20;
    const tableEnd = 8 + count * recordSize;
    requirePackage(count > 0 && tableEnd <= bytes.length, code);
    const slices: UuidArch[] = [];
    const ranges: { start: number; end: number }[] = [];
    for (let index = 0; index < count; index++) {
      const record = 8 + index * recordSize;
      const startValue = is64
        ? view.getBigUint64(record + 8, little)
        : BigInt(view.getUint32(record + 8, little));
      const sizeValue = is64
        ? view.getBigUint64(record + 16, little)
        : BigInt(view.getUint32(record + 12, little));
      requirePackage(
        startValue >= BigInt(tableEnd) &&
          sizeValue > 0n &&
          startValue + sizeValue <= BigInt(bytes.length),
        code,
      );
      const start = Number(startValue);
      const end = Number(startValue + sizeValue);
      requirePackage(
        ranges.every((range) => end <= range.start || start >= range.end),
        code,
      );
      ranges.push({ start, end });
      const sliceBytes = bytes.subarray(start, end);
      const slice = readThin(sliceBytes);
      const sliceView = new DataView(
        sliceBytes.buffer,
        sliceBytes.byteOffset,
        sliceBytes.byteLength,
      );
      const sliceMagic = sliceView.getUint32(0);
      const sliceLittle = sliceMagic === 0xcefaedfe || sliceMagic === 0xcffaedfe;
      requirePackage(
        sliceView.getUint32(4, sliceLittle) === view.getUint32(record, little) &&
          sliceView.getUint32(8, sliceLittle) === view.getUint32(record + 4, little),
        code,
      );
      slices.push(slice);
    }
    return slices;
  } catch (error) {
    throw error instanceof GateError ? error : new GateError(code, 'Unreadable Mach-O header');
  }
}

function pairs(value: unknown): UuidArch[] {
  requirePackage(Array.isArray(value) && value.length > 0, 'PACKAGE_SCHEMA');
  for (const pair of value)
    requirePackage(
      pair &&
        typeof pair.uuid === 'string' &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(pair.uuid) &&
        typeof pair.arch === 'string' &&
        pair.arch.trim(),
      'PACKAGE_SCHEMA',
    );
  return value;
}
const pairKey = (pair: UuidArch) => `${pair.uuid.toLowerCase()}/${pair.arch.toLowerCase()}`;

function readDirectoryArtifacts(rootDir: string): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const walkDir = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name === '__MACOSX') continue;
      const fullPath = join(dir, entry.name);
      const stat = lstatSync(fullPath);
      requirePackage(
        !stat.isSymbolicLink(),
        'PACKAGE_EXTRACTION',
        'Symlink not allowed in symbol directory',
      );
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (stat.isFile()) {
        const rel = relative(rootDir, fullPath).split(/[/\\]/).join('/');
        requirePackage(
          rel.length > 0 && !rel.startsWith('/') && !rel.split('/').includes('..'),
          'PACKAGE_EXTRACTION',
        );
        const key = posix.normalize(`ios-symbols/${rel}`);
        requirePackage(!entries.has(key), 'PACKAGE_EXTRACTION', `Duplicate archive entry: ${key}`);
        entries.set(key, readFileSync(fullPath));
      }
    }
  };
  walkDir(rootDir);
  requirePackage(entries.size > 0, 'PACKAGE_EXTRACTION', 'Empty symbol directory');
  return entries;
}

/** Verify the local recovery archive or staged directory. An explicit retry can repair a pending Sentry upload. */
export async function verifyIosSymbolPackage({
  archivePath,
  buildId,
  now = Date.now,
  run = runCommand,
  resolveCli = resolveSentryCli,
  retryUpload = false,
}: {
  retryUpload?: boolean;
  archivePath: string;
  buildId: string;
  now?: () => number;
  run?: Run;
  resolveCli?: () => string;
}) {
  requirePackage(existsSync(archivePath), 'PACKAGE_ARCHIVE_MISSING');
  const topStat = lstatSync(archivePath);
  requirePackage(!topStat.isSymbolicLink(), 'PACKAGE_ARCHIVE_MISSING');
  const stat = statSync(archivePath);
  requirePackage(stat.isFile() || stat.isDirectory(), 'PACKAGE_ARCHIVE_MISSING');
  try {
    const artifacts = stat.isDirectory()
      ? readDirectoryArtifacts(archivePath)
      : readArchive(readFileSync(archivePath), 'PACKAGE_EXTRACTION');
    return {
      ...(await verifyPackageArtifacts(artifacts, buildId, now, run, resolveCli, retryUpload)),
      archivePath: sanitizeDiagnostic(resolve(archivePath)),
    };
  } catch (error) {
    throw error instanceof GateError ? error : new GateError('PACKAGE_VERIFICATION_FAILED');
  }
}

/** Apply the downloaded-package checks before atomically selecting a prepared package. */
export function verifyPreparedSymbolPackage(
  directory: string,
  buildId: string,
  run: Run,
  resolveCli: () => string,
) {
  const root = 'ios-symbols';
  const dir = `${root}/package-prepared`;
  const artifacts = new Map<string, Uint8Array>([
    [`${root}/package.complete`, Buffer.from(JSON.stringify({ directory: 'package-prepared' }))],
  ]);
  for (const name of ['dsyms.zip', 'archive-info.plist', 'manifest.json', 'verification.json'])
    artifacts.set(`${dir}/${name}`, readFileSync(resolve(directory, name)));
  return verifyPackageArtifacts(artifacts, buildId, Date.now, run, resolveCli);
}

async function verifyPackageArtifacts(
  artifacts: Map<string, Uint8Array>,
  buildId: string,
  now: () => number,
  run: Run,
  resolveCli: () => string,
  retryUpload = false,
) {
  const directories = new Set<string>();
  for (const path of artifacts.keys()) {
    const parts = path.split('/');
    if (parts.includes('__MACOSX')) continue;
    for (let index = 0; index < parts.length - 1; index++)
      if (parts[index] === 'ios-symbols') directories.add(parts.slice(0, index + 1).join('/'));
  }
  requirePackage(
    directories.size === 1,
    'PACKAGE_DIRECTORY',
    'Expected exactly one ios-symbols directory',
  );
  const root = [...directories][0];
  const complete = artifacts.has(`${root}/package.complete`);
  const repairing = !complete && retryUpload && artifacts.has(`${root}/upload.pending`);
  requirePackage(
    complete || repairing,
    'PACKAGE_INCOMPLETE',
    'Verified package unavailable. If upload.pending exists, retry the same build with --retry-upload.',
  );
  const marker = readJson(
    artifacts,
    `${root}/${repairing ? 'upload.pending' : 'package.complete'}`,
  );
  const directoryPattern = repairing ? /^attempt-[A-Za-z0-9]+$/ : /^package-[A-Za-z0-9]+$/;
  requirePackage(
    typeof marker?.directory === 'string' && directoryPattern.test(marker.directory),
    'PACKAGE_INCOMPLETE',
  );
  const dir = `${root}/${marker.directory}`;
  const manifest = readJson(artifacts, `${dir}/manifest.json`);
  const receipt = readJson(artifacts, `${dir}/verification.json`);
  requirePackage(
    manifest && typeof manifest === 'object' && receipt && typeof receipt === 'object',
    'PACKAGE_SCHEMA',
  );
  requirePackage(manifest.buildId === buildId && receipt.buildId === buildId, 'PACKAGE_BUILD_ID');
  requirePackage(
    receipt.manifestSha256 === evidence(artifacts.get(`${dir}/manifest.json`)!).sha256,
    'PACKAGE_MANIFEST_SHA256',
  );
  requirePackage(
    manifest.schemaVersion === 1 &&
      receipt.schemaVersion === 1 &&
      manifest.inventoryStatus === 'inspected' &&
      Array.isArray(manifest.bundles) &&
      manifest.bundles.length > 0 &&
      Array.isArray(manifest.dsyms) &&
      manifest.dsyms.length > 0,
    'PACKAGE_SCHEMA',
  );
  if (!repairing)
    requirePackage(
      ['preflight', 'upload', 'remoteVerification'].every(
        (stage) => receipt[stage]?.status === 'passed',
      ) && receipt.failure === null,
      'PACKAGE_GATE_STATUS',
    );
  const plist = artifacts.get(`${dir}/archive-info.plist`);
  requirePackage(plist, 'PACKAGE_PLIST_MISSING');
  const plistEvidence = evidence(plist);
  requirePackage(
    plistEvidence.size === manifest.archive?.infoPlist?.size &&
      plistEvidence.sha256 === manifest.archive?.infoPlist?.sha256,
    'PACKAGE_PLIST_SHA256',
  );
  const zipBytes = artifacts.get(`${dir}/dsyms.zip`);
  requirePackage(
    manifest.symbolPackage?.filename === 'dsyms.zip' && zipBytes,
    'PACKAGE_SYMBOLS_MISSING',
  );
  const zip = evidence(zipBytes);
  requirePackage(zip.size === manifest.symbolPackage.size && zip.size > 0, 'PACKAGE_SYMBOLS_SIZE');
  requirePackage(zip.sha256 === manifest.symbolPackage.sha256, 'PACKAGE_SYMBOLS_SHA256');
  const symbols = readArchive(zipBytes, 'PACKAGE_SYMBOLS_EXTRACTION', true);
  const dsyms = new Map<string, Uint8Array>();
  const covered = new Set<string>();
  for (const [path, bytes] of symbols) {
    if (
      !/^dSYMs\/.*\.dSYM\/Contents\/Resources\/DWARF\/[^/]+$/.test(path) ||
      path.split('/').includes('__MACOSX')
    )
      continue;
    dsyms.set(path, bytes);
  }
  requirePackage(dsyms.size > 0, 'PACKAGE_DSYM_INSPECTION', 'No dSYM DWARF files');
  const owned = requiredIosBundles<{ identifier: string; uuids: unknown }>(manifest.bundles);
  const expected = owned.flatMap((image) => pairs(image.uuids));
  for (const dsym of manifest.dsyms) {
    const identities = pairs(dsym.uuids);
    requirePackage(
      typeof dsym.dwarfPath === 'string' &&
        !posix.isAbsolute(dsym.dwarfPath) &&
        !dsym.dwarfPath.includes('\\') &&
        !dsym.dwarfPath.split('/').includes('..'),
      'PACKAGE_DWARF_PATH',
    );
    const actual = dsyms.get(posix.normalize(dsym.dwarfPath));
    requirePackage(actual, 'PACKAGE_DWARF_MISSING', `Missing original DWARF: ${dsym.dwarfPath}`);
    const original = evidence(actual);
    requirePackage(
      original.size === dsym.size && original.sha256 === dsym.sha256,
      'PACKAGE_DWARF_SHA256',
    );
    if (!identities.some((slice) => expected.some((pair) => pairKey(pair) === pairKey(slice))))
      continue;
    const actualPairs = new Set(readMachOSlices(actual).map(pairKey));
    for (const pair of identities)
      requirePackage(
        actualPairs.has(pairKey(pair)),
        'PACKAGE_UUID_COVERAGE',
        `Missing extracted identity: ${pairKey(pair)}`,
      );
    requirePackage(actualPairs.size === identities.length, 'PACKAGE_UUID_COVERAGE');
  }
  // Thin fat objects exactly as the upload gate does, so debug on one architecture
  // cannot qualify a stripped sibling. Only the three Cherry targets require source-line evidence.
  const scratch = mkdtempSync(join(tmpdir(), 'cherry-package-debug-'));
  try {
    const uploadPaths: string[] = [];
    const cli = resolveCli(); // @sentry/cli getPath(), never its JS launcher.
    for (const dsym of manifest.dsyms) {
      const path = dsym.dwarfPath as string;
      const slices = pairs(dsym.uuids);
      const bytes = dsyms.get(posix.normalize(path))!;
      const required = slices.filter((slice) =>
        expected.some((pair) => pairKey(pair) === pairKey(slice)),
      );
      if (!required.length) continue;
      const original = join(scratch, `original-${uploadPaths.length}`);
      writeFileSync(original, bytes);
      uploadPaths.push(original);
      for (const pair of required) {
        let object = original;
        if (slices.length > 1) {
          object = join(scratch, 'thin');
          await checked(run, 'xcrun', ['lipo', original, '-thin', pair.arch, '-output', object]);
        }
        let inspection;
        try {
          inspection = await inspectDsymSlice(run, cli, object, pair);
        } catch (error) {
          throw new GateError(
            error instanceof GateError && error.code === 'LOCAL_DEBUG_SCHEMA'
              ? 'PACKAGE_UUID_COVERAGE'
              : 'PACKAGE_DEBUG_INSPECTION',
            `Cannot inspect local dSYM: ${path} ${pairKey(pair)}`,
          );
        }
        if (inspection.sourceLineBytes > 0) covered.add(pairKey(pair));
      }
    }
    for (const pair of expected)
      requirePackage(
        covered.has(pairKey(pair)),
        'PACKAGE_UUID_COVERAGE',
        `Missing extracted full-debug slice: ${pairKey(pair)}`,
      );
    if (repairing) {
      const target = sentryTargetFromEnv(process.env);
      requirePackage(
        sentryTargetFingerprint(target) === manifest.sentryTarget,
        'PACKAGE_SENTRY_TARGET',
      );
      await queryDebugFiles({
        ctx: target,
        uuid: expected[0].uuid,
        deadlineMs: now() + VERIFICATION_TIMEOUT_MS,
        preflight: true,
        now,
      });
      const result = await uploadSymbolFiles(
        run,
        cli,
        target,
        uploadPaths,
        true,
        UPLOAD_TIMEOUT_MS,
      );
      requirePackage(
        result.exitCode === 0 && !result.signal && !result.spawnError && !result.timedOut,
        'PACKAGE_REPAIR_UPLOAD',
      );
      const deadlineMs = now() + VERIFICATION_TIMEOUT_MS;
      receipt.records = await waitForRemoteDebug({
        uuids: expected,
        deadlineMs,
        now,
        fetchRecords: (uuid) => queryDebugFiles({ ctx: target, uuid, deadlineMs, now }),
      });
    }
    for (const pair of expected) {
      requirePackage(
        Array.isArray(receipt.records) &&
          receipt.records.some(
            (record: Record<string, unknown>) =>
              record?.uuid === pair.uuid &&
              record.arch === pair.arch &&
              record.symbolType === 'macho' &&
              typeof record.id === 'string' &&
              /^[0-9]+$/.test(record.id) &&
              Array.isArray(record.features) &&
              record.features.includes('debug'),
          ),
        'PACKAGE_REMOTE_COVERAGE',
        `Missing Sentry verification for ${pairKey(pair)}`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    status: 'download-verified' as const,
    buildId,
    manifestSha256: receipt.manifestSha256,
    symbolPackage: zip,
    slices: covered.size,
    thirdPartySymbols: receipt.thirdPartySymbols ?? [],
    ...(repairing ? { repairedRecords: receipt.records } : {}),
    verifiedAt: new Date(now()).toISOString(),
    expiry: 'unknown',
  };
}

if (basename(process.argv[1] ?? '') === 'verifyIosSymbolPackage.ts') {
  void verifyIosSymbolPackage({
    archivePath: resolve(process.argv[2] ?? ''),
    buildId: process.argv[3] ?? '',
    retryUpload: process.argv[4] === '--retry-upload',
  }).then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(
        sanitizeDiagnostic(
          error instanceof GateError
            ? `${error.code}: ${error.message}`
            : 'PACKAGE_VERIFICATION_FAILED',
        ),
      );
      process.exitCode = 1;
    },
  );
}
