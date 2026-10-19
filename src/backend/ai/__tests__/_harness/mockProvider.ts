import type { ImageModelV3 } from '@ai-sdk/provider';
import { ProviderExtension, extensionRegistry } from '@cherrystudio/ai-core/provider';
import { MockProviderV3 } from 'ai/test';

const CONTRACT_ADAPTER_ID = 'openai-compatible';

export function installMockProvider(models: { image: ImageModelV3 }): () => void {
  const original = extensionRegistry.get(CONTRACT_ADAPTER_ID);
  if (!original) throw new Error(`Missing ${CONTRACT_ADAPTER_ID} provider extension`);

  const provider = new MockProviderV3({
    imageModels: { [models.image.modelId]: models.image },
  });

  extensionRegistry.unregister(CONTRACT_ADAPTER_ID);
  extensionRegistry.register(
    ProviderExtension.create({
      create: () => provider,
      name: CONTRACT_ADAPTER_ID,
      supportsImageGeneration: true,
    }),
  );

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    extensionRegistry.unregister(CONTRACT_ADAPTER_ID);
    extensionRegistry.register(original);
  };
}
