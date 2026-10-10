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
  contentHash: string;
  /** Bounded head of the instruction body, for the detail view. */
  instructionsPreview: string;
};

/**
 * Package validation determines installation. The profile and environment
 * guidance describe known execution limitations without blocking installation.
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
  /** Bind and enable for these Agents in the same commit; installation alone binds nothing. */
  agentIds?: readonly string[];
};

export type SkillUpdateResult =
  | { outcome: 'updated'; skill: Skill }
  | { outcome: 'unchanged'; skill: Skill }
  | { outcome: 'rejected'; skill: Skill; inspection: SkillInspection };

export type SkillsErrorCode =
  | 'search-unavailable'
  | 'candidate-expired'
  | 'source-invalid'
  | 'source-unreachable'
  | 'package-invalid'
  | 'package-too-large'
  | 'admission-unsupported'
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

/** One registry search result. Nothing is downloaded until its URL is resolved. */
export type SkillListing = {
  name: string;
  /** Publishing repository, `<owner>/<repo>`. */
  source: string;
  url: string;
};

/**
 * Package acquisition, admission, installation, update, and removal.
 * Library reads and Agent bindings are ordinary Data API endpoints.
 */
export interface SkillsModule {
  /** Search skills.sh by keywords; returns listings without downloading packages. */
  search(query: string, signal?: AbortSignal): Promise<SkillListing[]>;
  /** Resolve a skills.sh page or a public GitHub repository, directory, or `SKILL.md` URL. */
  resolve(url: string, signal?: AbortSignal): Promise<SkillCandidate[]>;
  /** The curated recommendation list bundled with this build. */
  listRecommended(): Promise<SkillCandidate[]>;
  /** Download, validate, and report environment guidance; never installs. */
  inspect(candidateId: string, signal?: AbortSignal): Promise<SkillInspection>;
  install(input: InstallSkillInput, signal?: AbortSignal): Promise<Skill>;
  /** Re-acquire the accepted source; a rejected revision leaves the installation intact. */
  update(skillId: string, signal?: AbortSignal): Promise<SkillUpdateResult>;
  uninstall(skillId: string): Promise<void>;
  /** Fires after any installation, update, or removal commits. */
  subscribeChanges(listener: () => void): () => void;
}
