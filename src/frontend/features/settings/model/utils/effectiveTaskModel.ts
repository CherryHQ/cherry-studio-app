import { isUniqueModelId, parseUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

type Selection = { model: Model; provider: Provider };
export type EffectiveTaskModel =
  | ({ status: 'configured' | 'useDefault' } & Selection)
  | { status: 'unavailableSelection' | 'noUsableModel' | 'disabled' | 'loading' | 'loadError' };

type Input = {
  kind: 'naming' | 'translate' | 'painting';
  configuredId: string | null | undefined;
  defaultId: string | null | undefined;
  namingEnabled: boolean;
  models: readonly Model[];
  providers: readonly Provider[];
  isLoading: boolean;
  hasError: boolean;
};

export function resolveEffectiveTaskModel(input: Input): EffectiveTaskModel {
  if (input.kind === 'naming' && !input.namingEnabled) return { status: 'disabled' };
  if (input.hasError) return { status: 'loadError' };
  if (input.isLoading) return { status: 'loading' };

  const find = (id: string | null | undefined): Selection | undefined => {
    if (!id || !isUniqueModelId(id)) return undefined;
    const model = input.models.find((item) => item.id === id);
    const provider = input.providers.find((item) => item.id === parseUniqueModelId(id).providerId);
    if (!model || !provider) return undefined;
    if (input.kind === 'naming' && provider.authMethods?.includes('external-cli')) return undefined;
    if (input.kind === 'painting' && createPaintingGenerationStrategy(model).kind === 'unavailable')
      return undefined;
    return { model, provider };
  };

  if (input.kind === 'painting') {
    const selection = find(input.configuredId);
    return selection ? { status: 'configured', ...selection } : { status: 'noUsableModel' };
  }
  if (input.kind === 'translate' && input.configuredId != null) {
    const selection = find(input.configuredId);
    return selection ? { status: 'configured', ...selection } : { status: 'unavailableSelection' };
  }
  if (input.kind === 'naming') {
    const selection = find(input.configuredId);
    if (selection) return { status: 'configured', ...selection };
    if (input.configuredId === input.defaultId) return { status: 'noUsableModel' };
  }
  const selection = find(input.defaultId);
  return selection ? { status: 'useDefault', ...selection } : { status: 'noUsableModel' };
}
