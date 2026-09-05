import type { UpdateModelDto } from '@/shared/data/api/schemas/models';
import type { Model } from '@/shared/data/types/model';

export const modelLimitFields = ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const;
export type ModelLimitField = (typeof modelLimitFields)[number];
export type ModelEditDraft = Record<ModelLimitField | 'name' | 'group' | 'notes', string>;

export function createModelEditDraft(model: Model): ModelEditDraft {
  return {
    name: model.name,
    group: model.group ?? '',
    notes: model.notes ?? '',
    contextWindow: model.contextWindow?.toString() ?? '',
    maxInputTokens: model.maxInputTokens?.toString() ?? '',
    maxOutputTokens: model.maxOutputTokens?.toString() ?? '',
  };
}

/** Omitted values stay omitted: editing a name must not materialize catalog limits. */
export function buildModelEditPatch(
  initial: ModelEditDraft,
  draft: ModelEditDraft,
): UpdateModelDto | null {
  if (!draft.name.trim()) return null;
  const patch: UpdateModelDto = {};
  for (const field of ['name', 'group', 'notes'] as const) {
    const value = draft[field].trim();
    if (value !== initial[field]) patch[field] = value;
  }
  for (const field of modelLimitFields) {
    const value = draft[field].trim();
    if (value === initial[field]) continue;
    const number = Number(value);
    if (!value || !Number.isSafeInteger(number) || number <= 0) return null;
    patch[field] = number;
  }
  return patch;
}
