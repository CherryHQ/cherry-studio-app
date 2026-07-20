/**
 * Capability-aware message shaping: drop media a model can't accept before it
 * reaches the provider. Also provides routing capabilities for attachment
 * routing (native file vs text extraction).
 *
 * Modality support is **model-intrinsic** (a model is vision/video/audio-capable
 * regardless of which `@ai-sdk/*` adapter or endpoint it routes through), so
 * image/video/audio key on model predicates. PDF support is additionally
 * **provider-specific** (only first-party providers accept native PDF input).
 *
 * Ported from desktop's `src/main/ai/messages/messageCapabilities.ts` and
 * `src/main/ai/runtime/aiSdk/params/nativeFileSupport.ts`.
 */

import type { UIMessage } from 'ai';

import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import {
  isAnthropicModel,
  isAudioModel,
  isGeminiModel,
  isOpenAILLMModel,
  isVideoModel,
  isVisionModel,
} from '../utils/model';
import type { AppProviderId } from '../types';

// ── Media & routing capabilities ─────────────────────────────────────

export interface MediaCapabilities {
  image: boolean;
  video: boolean;
  audio: boolean;
  /** PDF native support is provider-specific (first-party only). */
  pdf: boolean;
}

/** All-accepting — used as the safe default when capabilities are unknown. */
export const ALL_MEDIA: MediaCapabilities = {
  image: true,
  video: true,
  audio: true,
  pdf: true,
};

// ── Provider-specific PDF support ────────────────────────────────────

/**
 * First-party AppProviderIds whose SDK adapters accept native PDF file input.
 * Conservative default allow-list: an unknown third-party provider defaults to
 * false, so we never hand a file part to a compat endpoint that can't take one.
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

// ── Resolvers ────────────────────────────────────────────────────────

/**
 * Resolve media capabilities from model predicates.
 *
 * For image/video/audio this is purely model-intrinsic. For PDF an optional
 * provider context is required — pass `provider` and `aiSdkProviderId` to
 * get PDF support resolved; omit them to default `pdf: false`.
 */
export function resolveMediaCapabilities(
  model: Model,
  provider?: Provider,
  aiSdkProviderId?: AppProviderId,
): MediaCapabilities {
  return {
    image: isVisionModel(model),
    video: isVideoModel(model),
    audio: isAudioModel(model),
    pdf: provider && aiSdkProviderId ? supportsNativePdf(provider, model, aiSdkProviderId) : false,
  };
}

// ── Media stripping ──────────────────────────────────────────────────

type GatedModality = 'image' | 'video' | 'audio';

/** image/video/audio are capability-gated; pdf/text are not. */
function gatedModality(mediaType: string): GatedModality | undefined {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  return undefined;
}

/**
 * Replace `file` parts whose modality the model can't accept with a text note.
 *
 * Replacing in place (vs. dropping) keeps the turn non-empty and tells the model
 * an attachment was there, without depending on the coalesce/empty-assistant
 * rules to clean up after a deletion. PDFs are never stripped here — their
 * native-vs-extraction routing is handled by `attachmentRouting.ts`. Operates
 * on UIMessages before conversion.
 */
export function stripUnsupportedMedia<T extends UIMessage = UIMessage>(
  messages: T[],
  caps: MediaCapabilities,
): T[] {
  return messages.map((message) => {
    if (!message.parts?.length) return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (part.type !== 'file') return part;
      const modality = gatedModality(part.mediaType);
      if (!modality || caps[modality]) return part;
      changed = true;
      return {
        type: 'text',
        text: `[${modality} attachment omitted: this model does not accept ${modality} input]`,
      };
    });
    return changed ? ({ ...message, parts } as T) : message;
  });
}
