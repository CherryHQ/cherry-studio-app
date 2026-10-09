/**
 * The managed Skill package store.
 *
 * Layout below the selected storage generation, beside its database:
 *
 *   Data/Skills/<folderName>/revisions/<content hash hex>/<package files>
 *
 * Roots are resolved at access time and never persisted.
 * Staging lives under the cache directory and is disposable; publication moves
 * a complete staged tree into place, so an interrupted install leaves nothing
 * an accepted record could point at. Installed packages are never under the
 * cache directory, so cache eviction cannot remove them.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { storageDirectory } from '@/backend/data/storage/storagePaths';
import { SkillsError } from '@/shared/contracts/skills';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { skillContentHashHex } from '@/shared/data/types/skill';

import { isSafePackagePath, type SkillPackageFiles } from './skillPackage';

const logger = loggerService.withContext('SkillStorage');
const SKILL_DIRECTORY = ['Data', 'Skills'] as const;
const STAGING_DIRECTORY = 'SkillStaging';
const REVISIONS_DIRECTORY = 'revisions';
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Minimal file operations the store needs; the fake in tests implements the same port. */
export interface SkillFileSystem {
  exists(path: readonly string[]): boolean;
  isDirectory(path: readonly string[]): boolean;
  list(path: readonly string[]): string[];
  readBytes(path: readonly string[]): Promise<Uint8Array>;
  writeBytes(path: readonly string[], bytes: Uint8Array): void;
  createDirectory(path: readonly string[]): void;
  move(from: readonly string[], to: readonly string[]): Promise<void>;
  remove(path: readonly string[]): void;
}

export type SkillStorageRoots = {
  persistent: () => readonly string[];
  cache: () => readonly string[];
};

export type SkillRevisionRef = { folderName: string; contentHash: string };

export interface SkillStorage {
  /** Writes a complete package into a fresh staging directory and returns its handle. */
  stage(files: SkillPackageFiles): Promise<string>;
  discardStaging(handle: string): void;
  /** Moves a staged package into its immutable revision location. */
  publish(handle: string, ref: SkillRevisionRef): Promise<void>;
  hasRevision(ref: SkillRevisionRef): boolean;
  readFile(ref: SkillRevisionRef, packagePath: string): Promise<Uint8Array | null>;
  listFiles(ref: SkillRevisionRef): string[];
  /** Removes every revision of one Skill; best-effort after the record is gone. */
  removeSkill(folderName: string): void;
  /** Removes revisions and staging that no live record references. */
  reconcile(live: readonly SkillRevisionRef[]): void;
}

export function createSkillStorage(fs: SkillFileSystem, roots: SkillStorageRoots): SkillStorage {
  const skillsRoot = (): readonly string[] => [...roots.persistent(), ...SKILL_DIRECTORY];
  const stagingRoot = () => [...roots.cache(), STAGING_DIRECTORY];
  const revisionPath = (ref: SkillRevisionRef) => {
    assertSegment(ref.folderName);
    const revision = skillContentHashHex(ref.contentHash);
    assertSegment(revision);
    return [...skillsRoot(), ref.folderName, REVISIONS_DIRECTORY, revision];
  };

  return {
    async stage(files) {
      const handle = `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const base = [...stagingRoot(), handle];
      fs.createDirectory(base);
      try {
        for (const [path, bytes] of files) {
          if (!isSafePackagePath(path)) {
            throw new SkillsError('package-invalid', `Unsafe package path: ${path}`);
          }
          const segments = path.split('/');
          fs.createDirectory([...base, ...segments.slice(0, -1)]);
          fs.writeBytes([...base, ...segments], bytes);
        }
      } catch (error) {
        safeRemove(fs, base);
        throw error;
      }
      return handle;
    },

    discardStaging(handle) {
      assertSegment(handle);
      safeRemove(fs, [...stagingRoot(), handle]);
    },

    async publish(handle, ref) {
      assertSegment(handle);
      const source = [...stagingRoot(), handle];
      if (!fs.isDirectory(source)) {
        throw new SkillsError('candidate-expired', 'The staged package is no longer available.');
      }
      const destination = revisionPath(ref);
      if (fs.exists(destination)) {
        if (fs.exists([...destination, 'SKILL.md'])) {
          // Complete published revisions are immutable and named by digest.
          safeRemove(fs, source);
          return;
        }
        // A partially restored directory must not block reinstallation.
        safeRemove(fs, destination);
      }
      fs.createDirectory(destination.slice(0, -1));
      await fs.move(source, destination);
    },

    hasRevision(ref) {
      return fs.exists([...revisionPath(ref), 'SKILL.md']);
    },

    async readFile(ref, packagePath) {
      if (!isSafePackagePath(packagePath)) return null;
      const path = [...revisionPath(ref), ...packagePath.split('/')];
      if (!fs.exists(path) || fs.isDirectory(path)) return null;
      return fs.readBytes(path);
    },

    listFiles(ref) {
      const base = revisionPath(ref);
      const result: string[] = [];
      const walk = (relative: readonly string[]) => {
        for (const name of fs.list([...base, ...relative])) {
          const next = [...relative, name];
          if (fs.isDirectory([...base, ...next])) walk(next);
          else result.push(next.join('/'));
        }
      };
      if (fs.isDirectory(base)) walk([]);
      return result.sort();
    },

    removeSkill(folderName) {
      assertSegment(folderName);
      safeRemove(fs, [...skillsRoot(), folderName]);
    },

    reconcile(live) {
      const skills = skillsRoot();
      const liveByFolder = new Map<string, Set<string>>();
      for (const ref of live) {
        const digests = liveByFolder.get(ref.folderName) ?? new Set<string>();
        digests.add(skillContentHashHex(ref.contentHash));
        liveByFolder.set(ref.folderName, digests);
      }
      if (fs.isDirectory(skills)) {
        for (const folder of fs.list(skills)) {
          const digests = liveByFolder.get(folder);
          if (!digests) {
            safeRemove(fs, [...skills, folder]);
            continue;
          }
          const revisions = [...skills, folder, REVISIONS_DIRECTORY];
          if (!fs.isDirectory(revisions)) continue;
          for (const digest of fs.list(revisions)) {
            if (!digests.has(digest)) safeRemove(fs, [...revisions, digest]);
          }
        }
      }
      safeRemove(fs, stagingRoot());
    },
  };
}

function assertSegment(value: string): void {
  if (!SEGMENT_PATTERN.test(value) || value === '.' || value === '..') {
    throw new SkillsError('package-invalid', `Invalid storage segment: ${value}`);
  }
}

function safeRemove(fs: SkillFileSystem, path: readonly string[]): void {
  try {
    if (fs.exists(path)) fs.remove(path);
  } catch (error) {
    logger.warn('Failed to remove Skill storage path', { error, path: path.slice(-3).join('/') });
  }
}

/** Expo file-system implementation. Path arrays start with a `file://` root URI. */
export const expoSkillFileSystem: SkillFileSystem = {
  exists: (path) => new File(...path).exists || new Directory(...path).exists,
  isDirectory: (path) => new Directory(...path).exists,
  list: (path) => new Directory(...path).list().map((entry) => entry.name),
  readBytes: (path) => new File(...path).bytes(),
  writeBytes: (path, bytes) => new File(...path).write(bytes),
  createDirectory: (path) => {
    const directory = new Directory(...path);
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  },
  move: (from, to) => new Directory(...from).move(new Directory(...to)),
  remove: (path) => {
    const directory = new Directory(...path);
    if (directory.exists) directory.delete();
    else new File(...path).delete();
  },
};

export const expoSkillStorageRoots: SkillStorageRoots = {
  persistent: () => [storageDirectory().uri],
  cache: () => [Paths.cache.uri],
};

export const skillStorage: SkillStorage = createSkillStorage(
  expoSkillFileSystem,
  expoSkillStorageRoots,
);
