import type {
  Skill,
  SkillCandidate,
  CreateSkillInput,
  SkillInvocation,
  SkillLimitations,
  SkillManifestEntry,
  SkillPackageIssue,
} from '@/shared/data/types/skill';

import type {
  CherryinSkillLibraryDetail,
  CherryinSkillPage,
  CherryinSkillQuery,
} from './skillMarketplace';

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
 * Package validation determines installation. Limitations describe what the
 * app does not provide for the package, without blocking installation.
 */
export type SkillInspection = {
  candidate: SkillCandidate;
  package: SkillInspectedPackage | null;
  issues: SkillPackageIssue[];
  limitations: SkillLimitations | null;
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

/** Small, exact substitutions in the installed SKILL.md body; metadata and resources stay intact. */
export type SkillTextChange = { before: string; after: string; reason: string };
export type AdaptSkillInput = {
  skillId: string;
  /** Internal stale-write check, not a user-managed version. */
  expectedContentHash: string;
  changes: readonly SkillTextChange[];
};
export type SkillAdaptationPreview = {
  skill: Skill;
  instructions: string;
  previousInstructions: string;
};

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
  | 'content-changed'
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
  /** Publishing registry or repository. */
  source: string;
  url: string;
  /** Registry install count, when the registry reports one. */
  installs?: number;
};

/**
 * Package acquisition, inspection, installation, update, and removal.
 * Library reads and Agent bindings are ordinary Data API endpoints.
 */
export interface SkillsModule {
  /** Search CherryIN first, then skills.sh when no listing matches. Never downloads packages. */
  search(query: string, signal?: AbortSignal): Promise<SkillListing[]>;
  searchSkillsSh(query: string, signal?: AbortSignal): Promise<SkillListing[]>;
  listCherryin(input: CherryinSkillQuery, signal?: AbortSignal): Promise<CherryinSkillPage>;
  getCherryin(id: string, signal?: AbortSignal): Promise<CherryinSkillLibraryDetail>;
  /** skills.sh's most installed Skills; returns listings without downloading packages. */
  popular(signal?: AbortSignal): Promise<SkillListing[]>;
  /** Resolve a CherryIN listing, skills.sh page, or public GitHub package URL. */
  resolve(url: string, signal?: AbortSignal): Promise<SkillCandidate[]>;
  /** Download, validate, and report the app's limitations; never installs. */
  inspect(candidateId: string, signal?: AbortSignal): Promise<SkillInspection>;
  install(input: InstallSkillInput, signal?: AbortSignal): Promise<Skill>;
  /** Re-acquire the accepted source; a rejected revision leaves the installation intact. */
  update(skillId: string, signal?: AbortSignal): Promise<SkillUpdateResult>;
  /** Saves one generated SKILL.md in the library, without binding it to any Agent. */
  create(input: CreateSkillInput, signal?: AbortSignal): Promise<Skill>;
  previewAdaptation(input: AdaptSkillInput, signal?: AbortSignal): Promise<SkillAdaptationPreview>;
  /** Caller must obtain consent for these exact changes before saving. */
  adapt(input: AdaptSkillInput, signal?: AbortSignal): Promise<Skill>;
  uninstall(skillId: string): Promise<void>;
  /** Fires after any installation, update, or removal commits. */
  subscribeChanges(listener: () => void): () => void;
}
