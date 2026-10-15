import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import { SkillsError } from '@/shared/contracts/skills';

import { decodeUtf8, isSafePackagePath, type SkillPackageFiles } from './skillPackage';

export const SKILL_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
const ARCHIVE_MAX_FILES = 10_000;

const invalid = () =>
  new SkillsError('package-invalid', 'The Skill archive is invalid or has unsafe paths.');

/** Bounded streaming inflation; files remain in memory and are never executed or extracted. */
export async function readSkillArchive(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<SkillPackageFiles> {
  if (bytes.byteLength > SKILL_ARCHIVE_MAX_BYTES)
    throw new SkillsError('package-too-large', 'The Skill archive exceeds 32 MiB.');
  const source = {
    size: bytes.byteLength,
    read: (offset: number, length: number) => bytes.subarray(offset, offset + length),
  };
  // Preflight the central directory before expanding any untrusted bytes.
  const paths = new Map<string, string>();
  const directories = new Set<string>();
  const directory = readZipDirectory(source, {
    invalid,
    decodeName: decodeUtf8,
    tooLarge: () =>
      new SkillsError('package-too-large', 'The expanded Skill archive exceeds 32 MiB.'),
    maxRecords: ARCHIVE_MAX_FILES,
    maxExpandedBytes: SKILL_ARCHIVE_MAX_BYTES,
    allowDirectories: true,
    checkRecord: ({ path, directory: isDirectory }) => {
      if (!isSafePackagePath(path)) throw invalid();
      const parts = path.split('/');
      for (let length = 1; length <= parts.length; length++) {
        const prefix = parts.slice(0, length).join('/');
        const folded = prefix.normalize('NFC').toLowerCase();
        if (paths.has(folded) && paths.get(folded) !== prefix) throw invalid();
        paths.set(folded, prefix);
        if (length < parts.length || isDirectory) directories.add(prefix);
      }
    },
  });
  if (directory.entries.some((entry) => directories.has(entry.name))) throw invalid();

  const files = new Map<string, Uint8Array>();
  try {
    await extractZipEntries(source, directory, {
      invalid,
      decodeName: decodeUtf8,
      verifyCrc: true,
      signal,
      open: (entry) => {
        const output = new Uint8Array(entry.size);
        let written = 0;
        files.set(entry.name, output);
        return {
          write: (chunk) => {
            output.set(chunk, written);
            written += chunk.byteLength;
          },
        };
      },
    });
    return files;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SkillsError) throw error;
    throw new SkillsError('package-invalid', 'The Skill archive could not be read.', {
      cause: error,
    });
  }
}
