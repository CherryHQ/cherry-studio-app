/**
 * Resolve which providers/models can accept PDF as a native user-message file
 * part — the routing gate in `resolveFileUIPart`: native PDFs are inlined as
 * base64 data URLs; everything else has text extracted via the native module.
 *
 * Ported from desktop `src/main/ai/runtime/aiSdk/params/nativeFileSupport.ts`.
 *
 * Image/audio/video native input rides on model capability alone, so those
 * queries live in `messageCapabilities.ts`. Only PDF requires a first-party
 * provider check (its native-PDF support is provider-specific).
 */

import { isAnthropicModel, isGeminiModel, isOpenAILLMModel } from '../utils/model';
import type { AppProviderId } from '../types';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

/**
 * First-party AppProviderIds whose SDK adapters accept native PDF file input.
 *
 * The default is `false` for unknowns, so we never hand a file part to a compat
 * endpoint that can't take one.
 */
const NATIVE_PDF_PROVIDER_IDS = new Set<AppProviderId>([
  'openai',
  'openai-response',
  'anthropic',
  'gemini',
  'azure',
  'azure-responses',
  'azure-anthropic',
]);

/** Providers known to choke on native file parts; force text extraction. */
const FORCE_TEXT_PRESET_IDS = new Set<string>(['qiniu']);

function isFirstPartyFileProvider(provider: Provider, aiSdkProviderId: AppProviderId): boolean {
  if (
    FORCE_TEXT_PRESET_IDS.has(provider.id) ||
    (provider.presetProviderId != null && FORCE_TEXT_PRESET_IDS.has(provider.presetProviderId))
  ) {
    return false;
  }
  return NATIVE_PDF_PROVIDER_IDS.has(aiSdkProviderId);
}

function supportsNativePdf(
  provider: Provider,
  model: Model,
  aiSdkProviderId: AppProviderId,
): boolean {
  if (!isFirstPartyFileProvider(provider, aiSdkProviderId)) return false;

  if (
    aiSdkProviderId === 'openai' ||
    aiSdkProviderId === 'openai-response' ||
    aiSdkProviderId === 'azure' ||
    aiSdkProviderId === 'azure-responses'
  ) {
    return isOpenAILLMModel(model);
  }
  if (aiSdkProviderId === 'anthropic' || aiSdkProviderId === 'azure-anthropic') {
    return isAnthropicModel(model);
  }
  if (aiSdkProviderId === 'gemini') {
    return isGeminiModel(model);
  }
  return true;
}

export function shouldExtractPdf(
  provider: Provider,
  model: Model,
  aiSdkProviderId: AppProviderId,
): boolean {
  return !supportsNativePdf(provider, model, aiSdkProviderId);
}
