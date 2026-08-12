import { resolveIcon } from '@cherrystudio/ui/icons';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from './BrandAvatar';

type ModelAvatarProps = {
  model: Model;
  /** Absent while the model's provider is still loading; the initial stands in. */
  provider: Provider | undefined;
  size?: number;
};

/**
 * A model's logo in the same square, hairline-framed shape a provider gets, so a
 * list of models and a list of providers read as the same kind of thing.
 *
 * The round {@link ModelPickerIcon} still draws the model picker sheet and the
 * assistant screens; the two shapes coexist rather than becoming one component
 * with a shape switch.
 */
export function ModelAvatar({ model, provider, size }: ModelAvatarProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const providerIconId = provider?.presetProviderId ?? provider?.id;
  const iconSource = providerIconId ? resolveIcon(model.modelId, providerIconId) : undefined;
  const frameProps = { label: model.name, ...(size !== undefined && { size }) };

  if (!iconSource) {
    return <BrandAvatar {...frameProps} />;
  }

  return (
    <BrandAvatar {...frameProps}>
      <BrandAvatarIcon
        iconId={providerIconId}
        recyclingKey={model.id}
        source={iconSource[iconTheme]}
      />
    </BrandAvatar>
  );
}
