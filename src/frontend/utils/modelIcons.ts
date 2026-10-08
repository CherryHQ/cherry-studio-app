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
 */
export function resolveModelIconSources(modelId: string, providerId?: string) {
  // Match the model itself, not a gateway namespace or a transport-specific suffix.
  const baseModelId = getLowerBaseModelName(modelId);
  const modelIconSource = resolveModelIcon(baseModelId);
  const modelDerivedIconSource = modelIconSource ?? resolveModelToProviderIcon(baseModelId);
  const iconSource =
    modelDerivedIconSource ??
    (providerId === undefined ? undefined : resolveProviderIcon(providerId));

  return { iconSource, isProviderFallback: modelDerivedIconSource === undefined, modelIconSource };
}
