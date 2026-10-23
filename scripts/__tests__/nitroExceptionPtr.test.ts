import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { parseAllDocuments } from 'yaml';

const dependency = 'react-native-nitro-modules';
const version = '0.36.4';
const patchPath = `patches/${dependency}@${version}.patch`;
const bytes = readFileSync(patchPath);
const patch = bytes.toString('utf8');
const hash = createHash('sha256').update(bytes).digest('hex');
const sections = patch.split(/^diff --git /m).slice(1);
const [runtimeErrorPatch, promisePatch] = sections;

type Lockfile = {
  patchedDependencies?: Record<string, string>;
  importers: Record<string, { dependencies: Record<string, { version: string }> }>;
  snapshots: Record<string, unknown>;
};
const documents = parseAllDocuments(readFileSync('pnpm-lock.yaml', 'utf8'));
const lockfile = documents
  .map((document) => document.toJSON() as Lockfile)
  .find((document) => document.patchedDependencies)!;

// These guards protect patch content and pnpm wiring. Native symbol scans and
// iOS 17 installation/launch remain separate acceptance checks.
describe('Nitro Modules exception-pointer patch', () => {
  test('pins Nitro 0.36.4 and registers its matching patch path', () => {
    const { dependencies } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(dependencies[dependency]).toBe(version);
    expect(patchPath).toBe(`patches/${dependency}@${dependencies[dependency]}.patch`);
    expect(readFileSync('pnpm-workspace.yaml', 'utf8').split('\n')).toContain(
      `  ${dependency}@${version}: ${patchPath}`,
    );
  });

  test('uses LF bytes with exactly one final newline', () => {
    expect(bytes.filter((byte) => byte === 13)).toHaveLength(0);
    expect(bytes[bytes.length - 1]).toBe(10);
    expect(bytes[bytes.length - 2]).not.toBe(10);
  });

  test('records the raw-byte hash in Nitro’s own patchedDependencies entry', () => {
    expect(documents.every((document) => document.errors.length === 0)).toBe(true);
    expect(lockfile.patchedDependencies?.[`${dependency}@${version}`]).toBe(hash);
  });

  test('resolves Nitro itself with the patch hash in the importer and snapshots', () => {
    const patchedVersion = `${version}(patch_hash=${hash})`;
    expect(
      lockfile.importers['.'].dependencies[dependency].version.startsWith(patchedVersion),
    ).toBe(true);
    const snapshotKeys = Object.keys(lockfile.snapshots).filter((key) =>
      key.startsWith(`${dependency}@`),
    );
    expect(snapshotKeys.length).toBeGreaterThan(0);
    expect(snapshotKeys.every((key) => key.startsWith(`${dependency}@${patchedVersion}`))).toBe(
      true,
    );
  });

  test('contains only the two intended files with one hunk each', () => {
    expect(sections.map((section) => section.split('\n')[0])).toEqual([
      'a/ios/utils/RuntimeError.hpp b/ios/utils/RuntimeError.hpp',
      'a/cpp/core/Promise.hpp b/cpp/core/Promise.hpp',
    ]);
    expect(patch.startsWith('diff --git ')).toBe(true);
    expect(runtimeErrorPatch.match(/^@@.*$/gm)).toEqual(['@@ -14,7 +14,12 @@']);
    expect(promisePatch.match(/^@@.*$/gm)).toEqual(['@@ -36,7 +36,12 @@']);
  });

  test.each([
    ['RuntimeError', 2, 'return', runtimeErrorPatch],
    ['Promise', 6, 'reject', promisePatch],
  ] as const)(
    'replaces only the %s exception construction with the upstream block',
    (_name, spaces, action, section) => {
      const indent = ' '.repeat(spaces);
      const previous =
        action === 'return'
          ? 'return std::make_exception_ptr(std::runtime_error(message));'
          : 'reject(std::make_exception_ptr(std::runtime_error(message)));';
      expect(
        section.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')),
      ).toEqual([`-${indent}${previous}`]);
      const addedLines = section
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
      expect(addedLines).toEqual([
        `+${indent}// TODO: Switch to \`std::make_exception_ptr(..)\` instead of \`try\` + \`catch\` once we drop iOS 18 support or fix https://github.com/margelo/nitro/issues/1652 differently`,
        `+${indent}try {`,
        `+${indent}  throw std::runtime_error(message);`,
        `+${indent}} catch (...) {`,
        `+${indent}  ${action === 'return' ? 'return std::current_exception();' : 'reject(std::current_exception());'}`,
        `+${indent}}`,
      ]);
      expect(section).toContain(addedLines.join('\n'));
      const executableAdditions = addedLines.map((line) => line.replace(/\/\/.*$/, '')).join('\n');
      expect(executableAdditions).not.toContain('std::make_exception_ptr(');
    },
  );

  test('preserves signatures, message expressions, pending condition and message recovery context', () => {
    expect(runtimeErrorPatch).toContain(
      '\n static inline std::exception_ptr makeException(const std::string& message) {\n',
    );
    expect(runtimeErrorPatch).toContain('std::runtime_error(message)');
    expect(runtimeErrorPatch).toContain(
      '\n static inline std::string getExceptionMessage(const std::exception_ptr& exception) {\n',
    );
    expect(promisePatch).toContain(
      '\n   ~Promise() {\n' +
        '     if (isPending()) [[unlikely]] {\n' +
        '       auto message = std::string("Timeouted: Promise<") + TypeInfo::getFriendlyTypename<TResult>() + "> was destroyed!";\n',
    );
  });
});
