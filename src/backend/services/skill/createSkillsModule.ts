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
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { BundledSkillDefinition } from './bundled';
import { adaptSkillPackage, applySkillAdaptation } from './skillAdaptation';
import {
  analyzeSkillRequirements,
  evaluateSkillAdmission,
  type SkillAgentFacts,
} from './skillAdmission';
import type { SkillAi } from './skillAi';
import { assessSkillPackage } from './skillAssessment';
import { discoverSkillUrls, type SkillWebSearch } from './skillDiscovery';
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
  ai?: SkillAi;
  search?: SkillWebSearch;
  marketplace?: SkillMarketplace;
  db: { withWriteTx<T>(fn: (tx: Database) => Promise<T>): Promise<T> };
  skills: AgentGlobalSkillService;
  storage: SkillStorage;
  environment: SkillEnvironmentReader;
  sources: {
    bundled: SkillSourceAdapter & { list(): SkillSourceCandidate[] };
    clawhub?: SkillSourceAdapter;
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
  const assessments = new Map<string, SkillProfile>();
  const candidates = new Map<string, ResolvedCandidate>();
  const adaptations = new Map<string, NonNullable<Awaited<ReturnType<typeof adaptSkillPackage>>>>();
  const changes = new Emitter<void>();

  function rememberAssessment(profile: SkillProfile) {
    if (assessments.size >= 32 && !assessments.has(profile.packageDigest))
      assessments.delete(assessments.keys().next().value!);
    assessments.set(profile.packageDigest, profile);
  }

  function remember(candidate: SkillSourceCandidate): SkillSourceCandidate {
    if (candidates.size >= 64 && !candidates.has(candidate.candidateId)) {
      const oldest = candidates.keys().next().value!;
      candidates.delete(oldest);
      adaptations.delete(oldest);
    }
    candidates.set(candidate.candidateId, { candidate, resolvedAt: Date.now() });
    return candidate;
  }

  function requireCandidate(candidateId: string): SkillSourceCandidate {
    const entry = candidates.get(candidateId);
    if (!entry || Date.now() - entry.resolvedAt > CANDIDATE_TTL_MS) {
      candidates.delete(candidateId);
      adaptations.delete(candidateId);
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
    acceptedProfile?: SkillProfile,
  ): Promise<{
    inspection: SkillInspection;
    package: ValidatedSkillPackage | null;
    files: Awaited<ReturnType<SkillSourceAdapter['acquire']>>['files'] | null;
    originalFiles?: Awaited<ReturnType<SkillSourceAdapter['acquire']>>['files'];
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
    let pkg = validation.package;
    let files = acquisition.files;
    let originalFiles: typeof files | undefined;
    const installedProfile =
      acceptedProfile ?? (await deps.skills.findByLocator(candidate.source.locator))?.profile;
    const cached = adaptations.get(candidate.candidateId);
    const adaptedProfile = cached?.profile ?? installedProfile;
    if (adaptedProfile?.adaptation?.upstreamDigest === pkg.packageDigest) {
      const adapted = applySkillAdaptation(files, pkg, adaptedProfile.adaptation);
      if (adapted.package.packageDigest !== adaptedProfile.packageDigest)
        throw new SkillsError(
          'package-invalid',
          'The adapted package does not match its assessment.',
        );
      originalFiles = files;
      files = adapted.files;
      pkg = adapted.package;
    }
    const profile = candidate.reviewed
      ? buildProfile(pkg, candidate.reviewed)
      : (assessments.get(pkg.packageDigest) ??
        (adaptedProfile?.packageDigest === pkg.packageDigest ? adaptedProfile : undefined) ??
        (installedProfile?.packageDigest === pkg.packageDigest
          ? installedProfile
          : buildProfile(pkg, null)));
    const admission = evaluateSkillAdmission(
      profile,
      pkg.packageDigest,
      await deps.environment.read(),
    );
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
      files,
      ...(originalFiles ? { originalFiles } : {}),
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
    if (admission.status === 'unsupported') {
      throw new SkillsError(
        'admission-unsupported',
        'This Skill needs capabilities this device does not provide.',
      );
    }
    if (admission.status === 'unknown') {
      throw new SkillsError(
        'admission-unverified',
        'This Skill has not been verified for this device.',
      );
    }
    if (admission.status === 'setup-required') {
      throw new SkillsError(
        'admission-setup-required',
        'Configure the required capabilities first.',
      );
    }
  }

  const admissions: SkillAdmissionReader = {
    async evaluate(skills, agentId) {
      const environment = await deps.environment.read();
      const agent = agentId ? await deps.agentFacts(agentId) : null;
      return skills.map((skill) => {
        const hasPackage = deps.storage.isAvailable() && deps.storage.hasRevision(skill);
        const admission: SkillAdmission = hasPackage
          ? evaluateSkillAdmission(skill.profile, skill.packageDigest, environment)
          : { status: 'setup-required', reasons: [{ code: 'package-unavailable', subject: null }] };
        return agent
          ? {
              admission,
              agentAdmission: !hasPackage
                ? admission
                : evaluateSkillAdmission(skill.profile, skill.packageDigest, environment, agent),
            }
          : { admission };
      });
    },
  };

  const module: SkillsBackend = {
    admissions,

    async discover(query, signal) {
      if (!query.trim() || query.length > 2000)
        throw new SkillsError('source-invalid', 'Provide a concise Skill request or URL.');
      if (deps.marketplace && /^https:\/\//i.test(query.trim())) {
        const resolved = await deps.marketplace.resolveUrl(query.trim(), signal);
        return {
          items: await Promise.all(
            resolved.map(async (candidate) => ({
              candidate: await toPublicCandidate(remember(candidate)),
              reason: '',
            })),
          ),
          partial: false,
        };
      }
      if (!deps.ai) throw new SkillsError('ai-unavailable', 'Skill AI is unavailable.');
      let marketplacePartial = false;
      const webSearchAvailable = async () =>
        Boolean(
          deps.search && (await deps.environment.read()).webSearchAvailability.searchKeywords,
        );
      if (deps.marketplace) {
        try {
          const result = await deps.marketplace.search(query, deps.ai, signal);
          marketplacePartial = result.partial;
          if (result.items.length || !(await webSearchAvailable()))
            return {
              ...result,
              items: await Promise.all(
                result.items.map(async ({ candidate, reason }) => ({
                  candidate: await toPublicCandidate(remember(candidate)),
                  reason,
                })),
              ),
            };
        } catch (error) {
          signal?.throwIfAborted();
          if (!(await webSearchAvailable())) throw error;
          marketplacePartial = true;
        }
      }
      if (!deps.search) throw new SkillsError('search-unavailable', 'Skill search is unavailable.');
      const found = await discoverSkillUrls(deps.ai, deps.search, query, signal);
      const items: Awaited<ReturnType<SkillsModule['discover']>>['items'] = [];
      let partial = found.partial || marketplacePartial;
      const resolved = new Set<string>();
      // Bound acquisition concurrency and preserve the model's relevance order.
      for (const match of found.matches) {
        try {
          const candidate = await deps.sources.github.resolveUrl(match.url, signal);
          if (resolved.has(candidate.candidateId)) continue;
          resolved.add(candidate.candidateId);
          items.push({
            candidate: await toPublicCandidate(remember(candidate)),
            reason: match.reason,
          });
        } catch {
          signal?.throwIfAborted();
          partial = true;
        }
      }
      return { items, partial };
    },

    async assess(candidateId, signal) {
      if (!deps.ai) throw new SkillsError('ai-unavailable', 'Skill AI is unavailable.');
      const candidate = requireCandidate(candidateId);
      const { inspection, package: pkg, files } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files || candidate.reviewed) return inspection;
      const assessedProfile = await assessSkillPackage(
        deps.ai,
        pkg,
        files,
        deps.environment.pluginToolCatalog(),
        signal,
      );
      const profile = {
        ...assessedProfile,
        ...(inspection.profile?.adaptation ? { adaptation: inspection.profile.adaptation } : {}),
      };
      // Small process-local cache; only explicit assessments or accepted installation facts grant admission.
      rememberAssessment(profile);
      return {
        ...inspection,
        profile,
        candidate: { ...inspection.candidate, profileProvenance: profile.provenance },
        admission: evaluateSkillAdmission(
          profile,
          pkg.packageDigest,
          await deps.environment.read(),
        ),
      };
    },

    async prepare({ candidateId, adapt }, signal) {
      const inspection = await module.assess(candidateId, signal);
      if (
        !adapt ||
        !deps.ai ||
        !inspection.package ||
        inspection.admission?.status === 'ready' ||
        inspection.admission?.status === 'setup-required'
      )
        return inspection;
      const candidate = requireCandidate(candidateId);
      const acquired = await acquireAndInspect(candidate, signal);
      if (!acquired.package || !acquired.files || acquired.originalFiles) return inspection;
      const adapted = await adaptSkillPackage(
        deps.ai,
        acquired.package,
        acquired.files,
        deps.environment.pluginToolCatalog(),
        signal,
      );
      if (
        !adapted ||
        evaluateSkillAdmission(
          adapted.profile,
          adapted.package.packageDigest,
          await deps.environment.read(),
        ).status !== 'ready'
      )
        return inspection;
      if (adaptations.size >= 4) adaptations.delete(adaptations.keys().next().value!);
      adaptations.set(candidateId, adapted);
      rememberAssessment(adapted.profile);
      return (await acquireAndInspect(candidate, signal)).inspection;
    },

    async listRecommended() {
      return Promise.all(
        deps.sources.bundled.list().map((candidate) => toPublicCandidate(remember(candidate))),
      );
    },

    async resolveGithub(url, signal) {
      return toPublicCandidate(remember(await deps.sources.github.resolveUrl(url, signal)));
    },

    async inspect(candidateId, signal) {
      const { inspection } = await acquireAndInspect(requireCandidate(candidateId), signal);
      return inspection;
    },

    async install(input: InstallSkillInput, signal) {
      const candidate = requireCandidate(input.candidateId);
      if (!deps.storage.isAvailable()) {
        throw new SkillsError(
          'storage-unavailable',
          'Managed Skill storage is unavailable on this client.',
        );
      }
      const existing = await deps.skills.findByLocator(candidate.source.locator);
      if (existing && !input.agentIds?.length)
        throw new SkillsError('already-installed', 'This Skill is already installed.');
      const {
        inspection,
        package: pkg,
        files,
        originalFiles,
      } = await acquireAndInspect(candidate, signal);
      if (!pkg || !files || !inspection.profile || !inspection.admission) {
        throw new SkillsError('package-invalid', 'The Skill package failed validation.');
      }
      assertInstallable(inspection.admission);
      if (
        (input.expectedPackageDigest && input.expectedPackageDigest !== pkg.packageDigest) ||
        (input.expectedProfileDigest &&
          input.expectedProfileDigest !== sha256HexOfText(JSON.stringify(inspection.profile)))
      ) {
        throw new SkillsError(
          'admission-unverified',
          'The prepared package or assessment changed. Prepare it again before installing.',
        );
      }
      for (const agentId of input.agentIds ?? []) {
        const facts = await deps.agentFacts(agentId);
        if (!facts) throw new SkillsError('not-found', 'The target Agent no longer exists.');
        assertInstallable(
          evaluateSkillAdmission(
            inspection.profile,
            pkg.packageDigest,
            await deps.environment.read(),
            facts,
          ),
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
          if (originalFiles && inspection.profile!.adaptation) {
            const originalHandle = await deps.storage.stage(originalFiles);
            try {
              await deps.storage.publish(originalHandle, {
                folderName,
                packageDigest: inspection.profile!.adaptation.upstreamDigest,
              });
            } catch (error) {
              deps.storage.discardStaging(originalHandle);
              throw error;
            }
          }
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
        adaptations.delete(input.candidateId);
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
      const candidate = remember({
        ...resolved,
        source: {
          ...resolved.source,
          ...(current.source.discovery ? { discovery: current.source.discovery } : {}),
        },
      });
      const {
        inspection,
        package: pkg,
        files,
        originalFiles,
      } = await acquireAndInspect(candidate, signal, current.profile);
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
          if (originalFiles && inspection.profile!.adaptation) {
            const originalHandle = await deps.storage.stage(originalFiles);
            try {
              await deps.storage.publish(originalHandle, {
                folderName: current.folderName,
                packageDigest: inspection.profile!.adaptation.upstreamDigest,
              });
            } catch (error) {
              deps.storage.discardStaging(originalHandle);
              throw error;
            }
          }
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
      if (!deps.storage.isAvailable()) return;
      const live = await deps.skills.listStorageReferences();
      deps.storage.reconcile(live);
    },
  };
  return module;
}

export type { Skill };
