import type { LanguageModelV2, LanguageModelV3 } from '@ai-sdk/provider';

import type { AiSdkModel } from '../providers';

export const isV2Model = (model: AiSdkModel): model is LanguageModelV2 => {
  return typeof model === 'object' && model !== null && model.specificationVersion === 'v2';
};

export const isV3Model = (model: AiSdkModel): model is LanguageModelV3 => {
  return typeof model === 'object' && model !== null && model.specificationVersion === 'v3';
};
