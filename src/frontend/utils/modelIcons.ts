import {
  resolveModelIcon,
  resolveModelToProviderIcon,
  resolveProviderIcon,
} from '@cherrystudio/ui/icons';
import { getLowerBaseModelName } from '@cherrystudio/universal/utils/model';

/**
 * A model's icon walks model icon → its maker's provider icon → the hosting
 * provider's built-in icon. `isProviderFallback` marks that last tier, where a
 * provider avatar the user uploaded outranks the built-in one.
 * Compact identity rows can prefer the maker's mark when it is available.
 */
export function resolveModelIconSources(
  modelId: string,
  providerId?: string,
  artwork: 'model' | 'brand' = 'model',
) {
  // Match the model itself, not a gateway namespace or a transport-specific suffix.
  const baseModelId = getLowerBaseModelName(modelId);
  const makerIconSource = resolveModelToProviderIcon(baseModelId);
  const modelIconSource =
    artwork === 'brand' && makerIconSource ? undefined : resolveModelIcon(baseModelId);
  const modelDerivedIconSource = modelIconSource ?? makerIconSource;
  const iconSource =
    modelDerivedIconSource ??
    (providerId === undefined ? undefined : resolveProviderIcon(providerId));

  return { iconSource, isProviderFallback: modelDerivedIconSource === undefined, modelIconSource };
}
