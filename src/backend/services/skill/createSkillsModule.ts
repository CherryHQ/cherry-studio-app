/**
 * The Skills workflow owner: discovery, inspection, admission, managed
 * installation, update, and removal. Library reads and Agent bindings stay in
 * the Data API; per-turn scope resolution for the Agent Host lives beside it
 * in `skillScope.ts` and reads the same facts.
 */

import { Emitter } from '@/backend/core/lifecycle/event';
import type { SkillAdmissionReader } from '@/backend/data/api/handlers/skills';
import type { Database } from '@/backend/data/db/DbService';
import type {
  AgentGlobalSkillService,
  SkillInstallRecord,
} from '@/backend/data/services/AgentGlobalSkillService';
import {
  type InstallSkillInput,
  type SkillInspection,
  type SkillsModule,
  SkillsError,
  type SkillUpdateResult,
} from '@/shared/contracts/skills';
import type {
  Skill,
  SkillAdmission,
  SkillCandidate,
  SkillProfile,
} from '@/shared/data/types/skill';

import type { BundledSkillDefinition } from './bundled';
import {
  analyzeSkillRequirements,
  evaluateSkillAdmission,
  type SkillAgentFacts,
} from './skillAdmission';
import type { SkillEnvironmentReader } from './skillEnvironment';
import type { SkillMarketplace } from './skillMarketplace';
import {
  previewInstructions,
  validateSkillPackage,
  type ValidatedSkillPackage,
} from './skillPackage';
import type { SkillSourceAdapter, SkillSourceCandidate } from './skillSources';
import type { SkillStorage } from './skillStorage';

const CANDIDATE_TTL_MS = 30 * 60 * 1000;

export type SkillsModuleDependencies = {
  marketplace: SkillMarketplace;
  db: { withWriteTx<T>(fn: (tx: Database) => Promise<T>): Promise<T> };
  skills: AgentGlobalSkillService;
  storage: SkillStorage;
  environment: SkillEnvironmentReader;
  sources: {
    bundled: SkillSourceAdapter & { list(): SkillSourceCandidate[] };
    github: SkillSourceAdapter & {
      resolveUrl(url: string, signal?: AbortSignal): Promise<SkillSourceCandidate>;
    };
  };
  /** Agent facts for binding-time and turn-time evaluation. */
  agentFacts(agentId: string): Promise<SkillAgentFacts | null>;
};

type ResolvedCandidate = { candidate: SkillSourceCandidate; resolvedAt: number };

export type SkillsBackend = SkillsModule & {
  admissions: SkillAdmissionReader;
  /** Startup-only cleanup, before any installations or Agent turns can start. */
  reconcileStorage(): Promise<void>;
};

export function createSkillsModule(deps: SkillsModuleDependencies): SkillsBackend {
  const candidates = new Map<string, ResolvedCandidate>();
  const changes = new Emitter<void>();

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
    const installed = await deps.skills.findByLocator(candidate.source.locator);
    return {
      candidateId: candidate.candidateId,
      name: candidate.name,
      description: candidate.description,
      source: candidate.source,
      author: candidate.author,
      version: candidate.version,
      tags: candidate.tags,
      profileProvenance: candidate.reviewed ? 'reviewed' : 'analyzed',
      installedSkillId: installed?.id ?? null,
    };
  }

  function buildProfile(
    pkg: ValidatedSkillPackage,
    reviewed: BundledSkillDefinition | null,
  ): SkillProfile {
    if (reviewed) {
      return {
        packageDigest: pkg.packageDigest,
        provenance: 'reviewed',
        requirements: reviewed.requirements,
        workflowScope: reviewed.workflowScope,
      };
    }
    return analyzeSkillRequirements(pkg, deps.environment.pluginToolCatalog());
  }

  /** Acquire, validate, and admit one candidate; returns the staged package for installation. */
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
          profile: null,
          admission: null,
        },
        package: null,
        files: null,
      };
    }
    const pkg = validation.package;
    const profile = buildProfile(pkg, candidate.reviewed);
    const admission = evaluateSkillAdmission(profile, await deps.environment.read());
    return {
      inspection: {
        candidate: { ...publicCandidate, profileProvenance: profile.provenance },
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
          packageDigest: pkg.packageDigest,
          instructionsPreview: previewInstructions(pkg.instructions),
        },
        issues: [],
        profile,
        admission,
      },
      package: pkg,
      files: acquisition.files,
    };
  }

  function toRecord(
    candidate: SkillSourceCandidate,
    pkg: ValidatedSkillPackage,
    profile: SkillProfile,
  ): SkillInstallRecord {
    return {
      name: pkg.name,
      description: pkg.description,
      source: candidate.source,
      author: pkg.author ?? candidate.author,
      version: pkg.version ?? candidate.version,
      license: pkg.license,
      compatibility: pkg.compatibility,
      tags: pkg.tags.length > 0 ? pkg.tags : candidate.tags,
      entryDigest: pkg.entryDigest,
      packageDigest: pkg.packageDigest,
      manifest: pkg.manifest,
      profile,
      invocation: pkg.invocation,
    };
  }

  function assertInstallable(admission: SkillAdmission): void {
    if (admission.status === 'ready') return;
    // Reason codes let the conversation explain the blocker without another inspection.
    const reasons = admission.reasons
      .map(({ code, subject }) => (subject ? `${code} (${subject})` : code))
      .join(', ');
    if (admission.status === 'unsupported')
      throw new SkillsError(
        'admission-unsupported',
        `This Skill needs capabilities this device does not provide: ${reasons}.`,
      );
    throw new SkillsError(
      'admission-setup-required',
      `Configure the required capabilities first: ${reasons}.`,
    );
  }

  const admissions: SkillAdmissionReader = {
    async evaluate(skills, agentId) {
      const environment = await deps.environment.read();
      const agent = agentId ? await deps.agentFacts(agentId) : null;
      return skills.map((skill) => {
        const hasPackage = deps.storage.hasRevision(skill);
        const admission: SkillAdmission = hasPackage
          ? evaluateSkillAdmission(skill.profile, environment)
          : { status: 'setup-required', reasons: [{ code: 'package-unavailable', subject: null }] };
        return agent
          ? {
              admission,
              agentAdmission: !hasPackage
                ? admission
                : evaluateSkillAdmission(skill.profile, environment, agent),
            }
          : { admission };
      });
    },
  };

  const module: SkillsBackend = {
    admissions,

    async search(query, signal) {
      const trimmed = query.trim();
      if (!trimmed || trimmed.length > 200)
        throw new SkillsError('source-invalid', 'Provide concise Skill search keywords.');
      return deps.marketplace.search(trimmed, signal);
    },

    async resolve(url, signal) {
      const resolved = await deps.marketplace.resolveUrl(url, signal);
      return Promise.all(resolved.map((candidate) => toPublicCandidate(remember(candidate))));
    },

    async listRecommended() {
      return Promise.all(
        deps.sources.bundled.list().map((candidate) => toPublicCandidate(remember(candidate))),
      );
    },

    async inspect(candidateId, signal) {
      const { inspection } = await acquireAndInspect(requireCandidate(candidateId), signal);
      return inspection;
    },

    async install(input: InstallSkillInput, signal) {
      const candidate = requireCandidate(input.candidateId);
      const existing = await deps.skills.findByLocator(candidate.source.locator);
      if (existing && !input.agentIds?.length)
        throw new SkillsError('already-installed', 'This Skill is already installed.');
      const { inspection, package: pkg, files } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files || !inspection.profile || !inspection.admission) {
        throw new SkillsError('package-invalid', 'The Skill package failed validation.');
      }
      assertInstallable(inspection.admission);
      for (const agentId of input.agentIds ?? []) {
        const facts = await deps.agentFacts(agentId);
        if (!facts) throw new SkillsError('not-found', 'The target Agent no longer exists.');
        assertInstallable(
          evaluateSkillAdmission(inspection.profile, await deps.environment.read(), facts),
        );
      }
      signal?.throwIfAborted();

      if (existing) {
        if (existing.packageDigest !== pkg.packageDigest || !deps.storage.hasRevision(existing))
          throw new SkillsError(
            'already-installed',
            'An existing revision needs an explicit update or repair.',
          );
        if (!existing.isGlobalEnabled)
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
      let folderName: string | null = null;
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          folderName = await deps.skills.allocateFolderNameTx(tx, pkg.name);
          signal?.throwIfAborted();
          // Publish before the row commits: a failed commit leaves an orphan
          // directory that reconciliation reclaims, never a row without bytes.
          await deps.storage.publish(handle, { folderName, packageDigest: pkg.packageDigest });
          return deps.skills.createTx(
            tx,
            toRecord(candidate, pkg, inspection.profile!),
            folderName,
            input.agentIds ?? [],
          );
        });
        candidates.delete(input.candidateId);
        changes.fire();
        return skill;
      } catch (error) {
        deps.storage.discardStaging(handle);
        // Defer orphan cleanup: another committed installation may already
        // share a source or alias by the time this rejected transaction unwinds.
        throw error;
      }
    },

    async update(skillId, signal): Promise<SkillUpdateResult> {
      const current = await deps.skills.getById(skillId);
      const source = deps.sources[current.source.registry];
      if (!source) throw new SkillsError('source-invalid', 'This Skill source is unavailable.');
      const resolved =
        current.source.registry === 'github' && current.source.url
          ? await deps.sources.github.resolveUrl(current.source.url, signal)
          : await source.resolve(current.source.locator, signal);
      const candidate = remember(resolved);
      const { inspection, package: pkg, files } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files || !inspection.profile || !inspection.admission) {
        return { outcome: 'rejected', skill: current, inspection };
      }
      if (
        pkg.packageDigest === current.packageDigest &&
        candidate.source.revision === current.source.revision &&
        deps.storage.hasRevision(current)
      ) {
        return { outcome: 'unchanged', skill: current };
      }
      if (inspection.admission.status !== 'ready') {
        return { outcome: 'rejected', skill: current, inspection };
      }
      const handle = await deps.storage.stage(files);
      try {
        const skill = await deps.db.withWriteTx(async (tx) => {
          signal?.throwIfAborted();
          await deps.storage.publish(handle, {
            folderName: current.folderName,
            packageDigest: pkg.packageDigest,
          });
          return deps.skills.updateRevisionTx(
            tx,
            skillId,
            toRecord(candidate, pkg, inspection.profile!),
          );
        });
        changes.fire();
        // The previous revision stays until reconciliation so an active turn can finish reading it.
        return { outcome: 'updated', skill };
      } catch (error) {
        deps.storage.discardStaging(handle);
        throw error;
      }
    },

    async uninstall(skillId) {
      await deps.db.withWriteTx((tx) => deps.skills.tombstoneTx(tx, skillId));
      changes.fire();
      // Existing turns keep their pinned files until startup reconciliation.
      // The tombstone and cascading bindings already exclude every new turn.
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
