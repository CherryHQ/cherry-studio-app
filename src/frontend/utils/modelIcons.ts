import { resolveModelIcon, resolveModelProviderIcon } from '@cherrystudio/ui/icons';
import { getLowerBaseModelName } from '@cherrystudio/universal/utils/model';

export function resolveModelIconSources(modelId: string, providerId?: string) {
  // Match the model itself, not a gateway namespace or a transport-specific suffix.
  const baseModelId = getLowerBaseModelName(modelId);
  const modelIconSource = resolveModelIcon(baseModelId);
  const iconSource =
    modelIconSource ??
    (providerId === undefined ? undefined : resolveModelProviderIcon(baseModelId, providerId));

  return { iconSource, modelIconSource };
}
