import { z } from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';

export const AVATAR_STUDIO_EXPRESSIONS = ['blink', 'thinking', 'waiting', 'done', 'error'] as const;
export type AvatarStudioExpression = (typeof AVATAR_STUDIO_EXPRESSIONS)[number];
export const AvatarStudioFrameSchema = z.strictObject({
  id: z.uuid(),
  file: z.string().regex(/^[0-9a-f-]{36}\.png$/),
});
export const AvatarStudioDraftSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  prompt: z.string().trim().min(1).max(2000),
  modelId: UniqueModelIdSchema,
  keyColor: z.enum(['green', 'magenta']),
  candidates: z.array(AvatarStudioFrameSchema).max(2),
  selectedId: z.uuid().optional(),
  sampleConfirmed: z.boolean(),
  expressions: z.partialRecord(z.enum(AVATAR_STUDIO_EXPRESSIONS), AvatarStudioFrameSchema),
  characterId: z.uuid().optional(),
  error: z.strictObject({ code: z.string(), diagnosticId: z.uuid() }).optional(),
});
export type AvatarStudioDraft = z.infer<typeof AvatarStudioDraftSchema>;
export type AvatarStudioState = {
  draft: AvatarStudioDraft | null;
  images: Record<string, string>;
  active: string | null;
};
export type AvatarStudioStep = 'candidates' | 'sample' | 'expressions';

/** A local, resumable avatar task. Each generate call is a separately approved, bounded batch. */
export interface AvatarStudioModule {
  get(): Promise<AvatarStudioState>;
  start(input: Pick<AvatarStudioDraft, 'name' | 'prompt' | 'modelId' | 'keyColor'>): Promise<void>;
  selectCandidate(draftId: string, candidateId: string): Promise<void>;
  generate(draftId: string, step: AvatarStudioStep): Promise<void>;
  confirmSample(draftId: string): Promise<void>;
  retryExpression(draftId: string, expression: AvatarStudioExpression): Promise<void>;
  save(draftId: string): Promise<string>;
  cancel(): void;
  discard(draftId: string): Promise<void>;
}
