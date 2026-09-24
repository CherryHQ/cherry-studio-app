import type {
  Skill,
  SkillAdmission,
  SkillCandidate,
  SkillInvocation,
  SkillManifestEntry,
  SkillPackageIssue,
  SkillProfile,
} from '@/shared/data/types/skill';

/** Validated package facts from staging; absent when validation failed. */
export type SkillInspectedPackage = {
  name: string;
  description: string;
  author: string | null;
  version: string | null;
  license: string | null;
  compatibility: string | null;
  tags: string[];
  invocation: SkillInvocation;
  manifest: SkillManifestEntry[];
  packageDigest: string;
  /** Bounded head of the instruction body, for the detail view. */
  instructionsPreview: string;
};

/**
 * The result of inspecting one candidate: validation issues first, then the
 * profile and admission derived for the current application environment.
 */
export type SkillInspection = {
  candidate: SkillCandidate;
  package: SkillInspectedPackage | null;
  issues: SkillPackageIssue[];
  profile: SkillProfile | null;
  admission: SkillAdmission | null;
};

export type InstallSkillInput = {
  candidateId: string;
  /** A conversation install must still match the package/profile checked against its tool snapshot. */
  expectedPackageDigest?: string;
  expectedProfileDigest?: string;
  /** Bind and enable for these Agents in the same commit; installation alone binds nothing. */
  agentIds?: readonly string[];
};

export type SkillUpdateResult =
  | { outcome: 'updated'; skill: Skill }
  | { outcome: 'unchanged'; skill: Skill }
  | { outcome: 'rejected'; skill: Skill; inspection: SkillInspection };

export type SkillsErrorCode =
  | 'ai-model-unconfigured'
  | 'ai-unavailable'
  | 'ai-response-invalid'
  | 'ai-package-too-large'
  | 'search-unavailable'
  | 'candidate-expired'
  | 'source-invalid'
  | 'source-unreachable'
  | 'package-invalid'
  | 'package-too-large'
  | 'admission-unsupported'
  | 'admission-unverified'
  | 'admission-setup-required'
  | 'storage-unavailable'
  | 'already-installed'
  | 'not-found';

export class SkillsError extends Error {
  constructor(
    readonly code: SkillsErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SkillsError';
  }
}

export function isSkillsError(error: unknown): error is SkillsError {
  return error instanceof SkillsError;
}

/**
 * Package acquisition, admission, installation, update, and removal.
 * Library reads and Agent bindings are ordinary Data API endpoints.
 */
export type SkillDiscoveryResult = {
  items: { candidate: SkillCandidate; reason: string }[];
  partial: boolean;
};

export interface SkillsModule {
  /** Resolve a supported URL or search registries with AI ranking and optional web-search fallback. */
  discover(query: string, signal?: AbortSignal): Promise<SkillDiscoveryResult>;
  /** Explicit model assessment of the complete candidate package; never executes or installs it. */
  assess(candidateId: string, signal?: AbortSignal): Promise<SkillInspection>;
  /** Assess, optionally create an equivalent mobile adaptation, then check the final package. */
  prepare(
    input: { candidateId: string; adapt: boolean },
    signal?: AbortSignal,
  ): Promise<SkillInspection>;
  /** The curated recommendation list bundled with this build. */
  listRecommended(): Promise<SkillCandidate[]>;
  /** Resolve an exact GitHub `SKILL.md` URL to a candidate pinned at one commit. */
  resolveGithub(url: string, signal?: AbortSignal): Promise<SkillCandidate>;
  /** Download into disposable staging, validate, and admit; never installs. */
  inspect(candidateId: string, signal?: AbortSignal): Promise<SkillInspection>;
  install(input: InstallSkillInput, signal?: AbortSignal): Promise<Skill>;
  /** Re-acquire the accepted source; a rejected revision leaves the installation intact. */
  update(skillId: string, signal?: AbortSignal): Promise<SkillUpdateResult>;
  uninstall(skillId: string): Promise<void>;
  /** Fires after any installation, update, or removal commits. */
  subscribeChanges(listener: () => void): () => void;
}
