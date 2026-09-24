import type { SkillAssessment, SkillProfile, SkillRequirements } from '@/shared/data/types/skill';

/** Workflow-owned model port; bootstrap supplies the concrete AI adapter. */
export interface SkillAi {
  adapt?(
    input: { files: readonly { path: string; content: string }[]; capabilities: unknown },
    signal?: AbortSignal,
  ): Promise<NonNullable<SkillProfile['adaptation']> | null>;
  reviewAdaptation?(
    input: {
      original: readonly { path: string; content: string }[];
      adapted: readonly { path: string; content: string }[];
      capabilities: unknown;
    },
    signal?: AbortSignal,
  ): Promise<boolean>;
  planSearch(query: string, signal?: AbortSignal): Promise<string[]>;
  rankResults(
    query: string,
    results: readonly { title: string; content: string; url: string }[],
    signal?: AbortSignal,
  ): Promise<{ index: number; reason: string }[]>;
  assess(
    input: { files: readonly { path: string; content: string }[]; capabilities: unknown },
    signal?: AbortSignal,
  ): Promise<{ requirements: SkillRequirements; assessment: SkillAssessment }>;
}
