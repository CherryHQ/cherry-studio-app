/**
 * The Skills workflow owner: discovery, inspection, managed
 * installation, update, and removal. Library reads and Agent bindings stay in
 * the Data API; per-turn scope resolution for the Agent Host lives beside it
 * in `skillScope.ts` and reads the same facts.
 */

import { Emitter } from '@/backend/core/lifecycle/event';
import type {
  SkillAvailabilityReader,
  SkillInstructionReader,
} from '@/backend/data/api/handlers/skills';
import type { Database } from '@/backend/data/db/DbService';
import type {
  AgentGlobalSkillService,
  SkillInstallRecord,
} from '@/backend/data/services/AgentGlobalSkillService';
import {
  type InstallSkillInput,
  type AdaptSkillInput,
  type SkillInspection,
  type SkillsModule,
  SkillsError,
  type SkillUpdateResult,
} from '@/shared/contracts/skills';
import { ErrorCode, isDataApiError } from '@/shared/data/api/errors';
import type { Skill, SkillCandidate } from '@/shared/data/types/skill';

import { adaptSkillPackage } from './skillAdaptation';
import { authorSkillPackage } from './skillAuthoring';
import { deriveSkillProfile, evaluateSkillLimitations } from './skillCompatibility';
import type { SkillMarketplace } from './skillMarketplace';
import {
  decodeUtf8,
  parseSkillEntry,
  previewInstructions,
  validateSkillPackage,
  type ValidatedSkillPackage,
} from './skillPackage';
import {
  installedSkillLocator,
  type SkillSourceAdapter,
  type SkillSourceCandidate,
} from './skillSources';
import type { SkillStorage } from './skillStorage';

const CANDIDATE_TTL_MS = 30 * 60 * 1000;

export type SkillsModuleDependencies = {
  marketplace: SkillMarketplace;
  db: { withWriteTx<T>(fn: (tx: Database) => Promise<T>): Promise<T> };
  skills: AgentGlobalSkillService;
  storage: SkillStorage;
  sources: {
    bundled: SkillSourceAdapter;
    github: SkillSourceAdapter & {
      resolveUrl(url: string, signal?: AbortSignal): Promise<SkillSourceCandidate>;
    };
  };
  agentExists(agentId: string): Promise<boolean>;
  readAuthor(): Promise<string>;
};

type ResolvedCandidate = { candidate: SkillSourceCandidate; resolvedAt: number };

export type SkillsBackend = SkillsModule & {
  availability: SkillAvailabilityReader;
  instructionReader: SkillInstructionReader;
  /** Startup-only cleanup, before any installations or Agent turns can start. */
  reconcileStorage(): Promise<void>;
};

export function createSkillsModule(deps: SkillsModuleDependencies): SkillsBackend {
  const candidates = new Map<string, ResolvedCandidate>();
  const changes = new Emitter<void>();

  async function prepareAdaptation(input: AdaptSkillInput, signal?: AbortSignal) {
    const skill = await deps.skills.getById(input.skillId);
    if (skill.source !== 'marketplace' || !skill.isEnabled)
      throw new SkillsError(
        'source-invalid',
        'Only enabled, installed external Skills can be adapted.',
      );
    if (skill.contentHash !== input.expectedContentHash)
      throw new SkillsError(
        'content-changed',
        'The local Skill changed. Read it and review a new proposal.',
      );
    const files = new Map<string, Uint8Array>();
    for (const { path } of skill.manifest) {
      signal?.throwIfAborted();
      const bytes = await deps.storage.readFile(skill, path);
      if (!bytes)
        throw new SkillsError('storage-unavailable', 'The installed package could not be read.');
      files.set(path, bytes);
    }
    const adapted = adaptSkillPackage(files, skill.name, input.changes);
    // Detect damaged files before replacing the current accepted package.
    const original = validateSkillPackage(files, { expectedName: skill.name });
    if (!original.ok || original.package.contentHash !== skill.contentHash)
      throw new SkillsError('package-invalid', 'The installed package failed its integrity check.');
    return { skill, ...adapted, previousInstructions: original.package.instructions };
  }

  function remember(candidate: SkillSourceCandidate): SkillSourceCandidate {
    if (candidates.size >= 64 && !candidates.has(candidate.candidateId))
      candidates.delete(candidates.keys().next().value!);
    candidates.set(candidate.candidateId, { candidate, resolvedAt: Date.now() });
    return candidate;
  }

  function requireCandidate(candidateId: string): SkillSourceCandidate {
    const entry = candidates.get(candidateId);
    if (!entry || Date.now() - entry.resolvedAt > CANDIDATE_TTL_MS) {
      candidates.delete(candidateId);
      throw new SkillsError('candidate-expired', 'Resolve the Skill again before installing it.');
    }
    return entry.candidate;
  }

  function sourceFor(candidate: SkillSourceCandidate): SkillSourceAdapter {
    const source = deps.sources[candidate.source.registry];
    if (!source) throw new SkillsError('source-invalid', 'This Skill source is unavailable.');
    return source;
  }

  async function toPublicCandidate(candidate: SkillSourceCandidate): Promise<SkillCandidate> {
    const installed = await findInstalled(candidate);
    return {
      candidateId: candidate.candidateId,
      name: candidate.name,
      description: candidate.description,
      source: candidate.source,
      author: candidate.author,
      version: candidate.version,
      tags: candidate.tags,
      installedSkillId: installed?.id ?? null,
    };
  }

  /** The installation in this candidate's folder, when it came from the same origin. */
  async function findInstalled(candidate: SkillSourceCandidate) {
    const installed = await deps.skills.findByFolderName(candidate.name);
    return installed && installedSkillLocator(installed) === candidate.source.locator
      ? installed
      : null;
  }

  /** Validate package bytes and report the app's limitations separately. */
  async function acquireAndInspect(
    candidate: SkillSourceCandidate,
    signal?: AbortSignal,
  ): Promise<{
    inspection: SkillInspection;
    package: ValidatedSkillPackage | null;
    files: Awaited<ReturnType<SkillSourceAdapter['acquire']>>['files'] | null;
  }> {
    const acquisition = await sourceFor(candidate).acquire(candidate, signal);
    signal?.throwIfAborted();
    const validation = validateSkillPackage(acquisition.files, {
      expectedName: acquisition.expectedName,
    });
    const publicCandidate = await toPublicCandidate(candidate);
    if (!validation.ok) {
      return {
        inspection: {
          candidate: publicCandidate,
          package: null,
          issues: validation.issues,
          limitations: null,
        },
        package: null,
        files: null,
      };
    }
    const pkg = validation.package;
    return {
      inspection: {
        candidate: publicCandidate,
        package: {
          name: pkg.name,
          description: pkg.description,
          author: pkg.author,
          version: pkg.version,
          license: pkg.license,
          compatibility: pkg.compatibility,
          tags: pkg.tags,
          invocation: pkg.invocation,
          manifest: pkg.manifest,
          contentHash: pkg.contentHash,
          instructionsPreview: previewInstructions(pkg.instructions),
        },
        issues: [],
        limitations: evaluateSkillLimitations({
          manifest: pkg.manifest,
          profile: deriveSkillProfile(pkg),
        }),
      },
      package: pkg,
      files: acquisition.files,
    };
  }

  function toRecord(
    candidate: SkillSourceCandidate,
    pkg: ValidatedSkillPackage,
  ): SkillInstallRecord {
    return {
      name: pkg.name,
      description: pkg.description,
      source: candidate.source.registry === 'bundled' ? 'builtin' : 'marketplace',
      sourceUrl: candidate.source.url,
      author: pkg.author ?? candidate.author,
      version: pkg.version ?? candidate.version,
      tags: pkg.tags.length > 0 ? pkg.tags : candidate.tags,
      contentHash: pkg.contentHash,
      manifest: pkg.manifest,
      // Read from the bytes once, here; reads only compare stored facts with the app's capabilities.
      profile: deriveSkillProfile(pkg),
      invocation: pkg.invocation,
    };
  }

  const module: SkillsBackend = {
    availability: {
      read: (skill) => ({
        isPackageMissing: !deps.storage.hasRevision(skill),
        limitations: evaluateSkillLimitations(skill),
      }),
    },
    instructionReader: {
      async read(skill) {
        if (!skill.manifest.some(({ path }) => path === 'SKILL.md')) return null;
        const bytes = await deps.storage.readFile(skill, 'SKILL.md');
        const text = bytes ? decodeUtf8(bytes) : null;
        const parsed = text === null ? null : parseSkillEntry(text);
        return parsed && 'body' in parsed ? parsed.body.trim() : null;
      },
    },

    async search(query, signal) {
      const trimmed = query.trim();
      if (!trimmed || trimmed.length > 200)
        throw new SkillsError('source-invalid', 'Provide concise Skill search keywords.');
      return deps.marketplace.search(trimmed, signal);
    },

    popular: (signal) => deps.marketplace.popular(signal),

    async resolve(url, signal) {
      const resolved = await deps.marketplace.resolveUrl(url, signal);
      if (resolved.some((candidate) => candidate.source.registry !== 'github'))
        throw new SkillsError(
          'source-invalid',
          'System Skills are not available for installation.',
        );
      return Promise.all(resolved.map((candidate) => toPublicCandidate(remember(candidate))));
    },

    async inspect(candidateId, signal) {
      const { inspection } = await acquireAndInspect(requireCandidate(candidateId), signal);
      return inspection;
    },

    async install(input: InstallSkillInput, signal) {
      const candidate = requireCandidate(input.candidateId);
      const occupant = await deps.skills.findByFolderName(candidate.name);
      const existing =
        occupant && installedSkillLocator(occupant) === candidate.source.locator ? occupant : null;
      if (occupant && !existing)
        throw new SkillsError(
          'already-installed',
          `A different Skill named ${candidate.name} is already installed.`,
        );
      if (existing && !input.agentIds?.length)
        throw new SkillsError('already-installed', 'This Skill is already installed.');
      const { package: pkg, files } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files) {
        throw new SkillsError('package-invalid', 'The Skill package failed validation.');
      }
      for (const agentId of input.agentIds ?? []) {
        if (!(await deps.agentExists(agentId)))
          throw new SkillsError('not-found', 'The target Agent no longer exists.');
      }
      signal?.throwIfAborted();

      if (existing) {
        if (!deps.storage.hasRevision(existing))
          throw new SkillsError(
            'already-installed',
            'An existing revision needs an explicit update or repair.',
          );
        if (!existing.isEnabled)
          throw new SkillsError(
            'admission-setup-required',
            'This Skill is globally disabled. Enable it in the Skill library first.',
          );
        await deps.db.withWriteTx(async (tx) => {
          for (const agentId of input.agentIds ?? [])
            await deps.skills.applyBindingUpdatesTx(tx, agentId, [
              { skillId: existing.id, isEnabled: true },
            ]);
        });
        changes.fire();
        return existing;
      }
      const handle = await deps.storage.stage(files);
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          signal?.throwIfAborted();
          // Publish before the row commits: a failed commit leaves an orphan
          // directory that reconciliation reclaims, never a row without bytes.
          await deps.storage.publish(handle, {
            folderName: pkg.name,
            contentHash: pkg.contentHash,
          });
          return deps.skills.createTx(tx, toRecord(candidate, pkg), input.agentIds ?? []);
        });
        candidates.delete(input.candidateId);
        changes.fire();
        return skill;
      } catch (error) {
        deps.storage.discardStaging(handle);
        // Startup reconciliation removes a revision no committed row references.
        throw error;
      }
    },

    async update(skillId, signal): Promise<SkillUpdateResult> {
      const current = await deps.skills.getById(skillId);
      const locator = installedSkillLocator(current);
      if (!locator) throw new SkillsError('source-invalid', 'This Skill source is unavailable.');
      const resolved =
        current.source === 'builtin'
          ? await deps.sources.bundled.resolve(locator, signal)
          : await deps.sources.github.resolveUrl(current.sourceUrl!, signal);
      const candidate = remember(resolved);
      const { inspection, package: pkg, files } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files) {
        return { outcome: 'rejected', skill: current, inspection };
      }
      if (pkg.contentHash === current.contentHash && deps.storage.hasRevision(current)) {
        return { outcome: 'unchanged', skill: current };
      }
      const handle = await deps.storage.stage(files);
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          signal?.throwIfAborted();
          await deps.storage.publish(handle, {
            folderName: current.folderName,
            contentHash: pkg.contentHash,
          });
          return deps.skills.updateRevisionTx(tx, skillId, toRecord(candidate, pkg));
        });
        changes.fire();
        // The previous revision stays until reconciliation so an active turn can finish reading it.
        return { outcome: 'updated', skill };
      } catch (error) {
        deps.storage.discardStaging(handle);
        throw error;
      }
    },

    async create(input, signal) {
      const { package: pkg, files } = authorSkillPackage(input, await deps.readAuthor());
      if (await deps.skills.findByFolderName(pkg.name))
        throw new SkillsError('already-installed', 'A Skill with this name already exists.');
      signal?.throwIfAborted();
      const handle = await deps.storage.stage(files);
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          signal?.throwIfAborted();
          await deps.storage.publish(handle, {
            folderName: pkg.name,
            contentHash: pkg.contentHash,
          });
          return deps.skills.createTx(
            tx,
            {
              name: pkg.name,
              description: pkg.description,
              source: 'marketplace',
              sourceUrl: null,
              author: pkg.author,
              version: pkg.version,
              tags: pkg.tags,
              contentHash: pkg.contentHash,
              manifest: pkg.manifest,
              profile: deriveSkillProfile(pkg),
              invocation: pkg.invocation,
            },
            [],
          );
        });
        changes.fire();
        return skill;
      } catch (error) {
        deps.storage.discardStaging(handle);
        if (isDataApiError(error) && error.code === ErrorCode.CONFLICT)
          throw new SkillsError('already-installed', 'A Skill with this name already exists.', {
            cause: error,
          });
        throw error;
      }
    },

    async previewAdaptation(input, signal) {
      const prepared = await prepareAdaptation(input, signal);
      return {
        skill: prepared.skill,
        instructions: prepared.package.instructions,
        previousInstructions: prepared.previousInstructions,
      };
    },

    async adapt(input, signal) {
      const prepared = await prepareAdaptation(input, signal);
      const handle = await deps.storage.stage(prepared.files);
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          signal?.throwIfAborted();
          await deps.storage.publish(handle, {
            folderName: prepared.skill.folderName,
            contentHash: prepared.package.contentHash,
          });
          return deps.skills.updateRevisionTx(
            tx,
            input.skillId,
            {
              ...prepared.skill,
              contentHash: prepared.package.contentHash,
              manifest: prepared.package.manifest,
            },
            input.expectedContentHash,
          );
        });
        changes.fire();
        return skill;
      } catch (error) {
        deps.storage.discardStaging(handle);
        throw error;
      }
    },

    async uninstall(skillId) {
      await deps.skills.getById(skillId);
      await deps.db.withWriteTx((tx) => deps.skills.deleteTx(tx, skillId));
      changes.fire();
      // Existing turns keep their pinned files until startup reconciliation.
      // The deleted row and bindings already exclude every new turn.
    },

    subscribeChanges(listener) {
      const subscription = changes.event(listener);
      return () => subscription.dispose();
    },

    async reconcileStorage() {
      const live = await deps.skills.listStorageReferences();
      deps.storage.reconcile(live);
    },
  };
  return module;
}

export type { Skill };
