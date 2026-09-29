import { useProviderAvatar } from '@/frontend/hooks/useProviderAvatar';
import { resolveModelIconSources } from '@/frontend/utils/modelIcons';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto } from './BrandAvatar';

type ModelAvatarProps = {
  model: Pick<Model, 'id' | 'modelId' | 'name' | 'providerId'>;
  /** Optional provider metadata refines custom-provider icon resolution. */
  provider?: Pick<Provider, 'id' | 'presetProviderId'>;
  size?: number;
};

/**
 * A model's logo in the same square, hairline-framed shape a provider gets, so a
 * list of models and a list of providers read as the same kind of thing.
 *
 * The round `ModelPickerIcon` still draws the assistant screens, where a model
 * appears one at a time rather than in a column; the two shapes coexist rather
 * than becoming one component with a shape switch.
 */
export function ModelAvatar({ model, provider, size }: ModelAvatarProps) {
  const providerIconId = provider?.presetProviderId ?? provider?.id ?? model.providerId;
  const { iconSource, isProviderFallback, modelIconSource } = resolveModelIconSources(
    model.modelId,
    providerIconId,
  );
  const providerAvatarUri = useProviderAvatar(provider?.id ?? model.providerId);
  const frameProps = { label: model.name, ...(size !== undefined && { size }) };

  if (isProviderFallback && providerAvatarUri) {
    return (
      <BrandAvatar {...frameProps}>
        <BrandAvatarPhoto uri={providerAvatarUri} />
      </BrandAvatar>
    );
  }

  if (!iconSource) {
    return <BrandAvatar {...frameProps} />;
  }

  return (
    <BrandAvatar {...frameProps}>
      <BrandAvatarIcon
        displayContext={modelIconSource ? undefined : 'provider'}
        recyclingKey={model.id}
        source={iconSource}
      />
    </BrandAvatar>
  );
}
