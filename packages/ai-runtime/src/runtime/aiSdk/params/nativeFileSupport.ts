import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import {
  isAnthropicModel,
  isAudioModel,
  isGeminiModel,
  isOpenAILLMModel,
  isVideoModel,
  isVisionModel,
} from '@cherrystudio/universal/utils/model';

import type { AppProviderId } from '../../../types';

export interface NativeFileSupport {
  readonly image: boolean;
  readonly pdf: boolean;
  readonly audio: boolean;
  readonly video: boolean;
}

const NATIVE_FILE_PROVIDER_IDS = new Set<AppProviderId>([
  'openai',
  'anthropic',
  'google',
  'azure',
  'azure-responses',
  'azure-anthropic',
  'google-vertex',
  'bedrock',
  'google-vertex-anthropic',
]);

const FORCE_TEXT_PROVIDER_IDS = new Set<string>(['qiniu']);

function isForceTextProvider(provider: Provider): boolean {
  return (
    FORCE_TEXT_PROVIDER_IDS.has(provider.id) ||
    (provider.presetProviderId != null && FORCE_TEXT_PROVIDER_IDS.has(provider.presetProviderId))
  );
}

function supportsNativePdf(
  provider: Provider,
  model: Model,
  aiSdkProviderId: AppProviderId,
): boolean {
  if (isForceTextProvider(provider) || !NATIVE_FILE_PROVIDER_IDS.has(aiSdkProviderId)) return false;

  if (
    aiSdkProviderId === 'openai' ||
    aiSdkProviderId === 'azure' ||
    aiSdkProviderId === 'azure-responses'
  ) {
    return isOpenAILLMModel(model);
  }
  if (
    aiSdkProviderId === 'anthropic' ||
    aiSdkProviderId === 'azure-anthropic' ||
    aiSdkProviderId === 'google-vertex-anthropic' ||
    aiSdkProviderId === 'bedrock'
  ) {
    return isAnthropicModel(model);
  }
  if (aiSdkProviderId === 'google' || aiSdkProviderId === 'google-vertex') {
    return isGeminiModel(model);
  }
  return true;
}

export function resolveNativeFileSupport(
  provider: Provider,
  model: Model,
  aiSdkProviderId: AppProviderId,
): NativeFileSupport {
  if (isForceTextProvider(provider)) {
    return { image: false, pdf: false, audio: false, video: false };
  }

  return {
    image: isVisionModel(model),
    pdf: supportsNativePdf(provider, model, aiSdkProviderId),
    audio: isAudioModel(model),
    video: isVideoModel(model),
  };
}
