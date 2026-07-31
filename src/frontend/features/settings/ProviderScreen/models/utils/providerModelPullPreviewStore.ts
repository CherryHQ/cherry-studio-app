import type { ProviderModelPullPreview } from './providerModelPullPreview';

const pullPreviewByProviderId = new Map<string, ProviderModelPullPreview>();

export function stashProviderModelPullPreview(
  providerId: string,
  preview: ProviderModelPullPreview,
) {
  pullPreviewByProviderId.set(providerId, preview);
}

export function consumeProviderModelPullPreview(
  providerId: string,
): ProviderModelPullPreview | null {
  const preview = pullPreviewByProviderId.get(providerId) ?? null;
  pullPreviewByProviderId.delete(providerId);
  return preview;
}
