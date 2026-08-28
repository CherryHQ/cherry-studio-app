/**
 * Capability-aware note text for media a model cannot accept. Part of the
 * normalized-history vocabulary shared by the Host (attachment replacement)
 * and Runtime implementations (history mapping), so both sides describe an
 * omitted attachment with the same provider-visible wording.
 */

export interface MediaCapabilities {
  image: boolean;
  video: boolean;
  audio: boolean;
  pdf?: boolean;
}

type GatedModality = keyof MediaCapabilities;

/** Native image/video/audio/PDF parts are gated; office and other files retain their current path. */
function gatedModality(mediaType: string): GatedModality | undefined {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  if (mediaType === 'application/pdf') return 'pdf';
  return undefined;
}

/** Return the provider-visible note for an unsupported media type. */
export function unsupportedMediaNote(
  mediaType: string,
  caps: MediaCapabilities,
): string | undefined {
  const modality = gatedModality(mediaType);
  return modality && caps[modality] === false
    ? `[${modality} attachment omitted: this model does not accept ${modality} input]`
    : undefined;
}
