import {
  getModelPickerBadges,
  MODEL_PICKER_BADGES,
} from '@/frontend/components/ModelPicker/utils/modelPickerBadges';
import type { Model } from '@/shared/data/types/model';
import { isSpeechToTextModel, isTextToSpeechModel } from '@/shared/utils/modelPurpose';

export const PROVIDER_MODEL_BADGES = [...MODEL_PICKER_BADGES, 'speech', 'transcription'] as const;
export type ProviderModelBadge = (typeof PROVIDER_MODEL_BADGES)[number];

export function getProviderModelBadges(model: Model): ProviderModelBadge[] {
  const badges: ProviderModelBadge[] = getModelPickerBadges(model);
  if (isTextToSpeechModel(model)) badges.push('speech');
  if (isSpeechToTextModel(model)) badges.push('transcription');
  return badges;
}
