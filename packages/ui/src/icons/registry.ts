import { resolveGeneralIcon } from '../icons-webp/general';
import { MODEL_ICONS, type ModelIconKey, resolveModelAssetIcon } from '../icons-webp/models';
import { resolveProviderAssetIcon } from '../icons-webp/providers';
import {
  MODEL_ICON_PATTERNS,
  MODEL_TO_PROVIDER_ICON_PATTERNS,
  PROVIDER_ID_ALIASES,
} from './desktop-routing';
import type { IconSource } from './types';

export { resolveGeneralIcon };

export function resolveModelIcon(modelId: string): IconSource | undefined {
  if (!modelId) return undefined;

  for (const [regex, catalogKey] of MODEL_ICON_PATTERNS) {
    if (regex.test(modelId)) {
      return MODEL_ICONS[catalogKey as ModelIconKey] ?? resolveModelAssetIcon(catalogKey);
    }
  }

  return undefined;
}

export function resolveModelToProviderIcon(modelId: string): IconSource | undefined {
  if (!modelId) return undefined;

  for (const [regex, providerId] of MODEL_TO_PROVIDER_ICON_PATTERNS) {
    if (regex.test(modelId)) {
      return resolveProviderIcon(providerId);
    }
  }

  return undefined;
}

export function resolveProviderIcon(providerId: string): IconSource | undefined {
  if (!providerId) return undefined;

  if (providerId === 'opencode') {
    return resolveGeneralIcon('open-code');
  }

  const providerIcon = resolveProviderAssetIcon(providerId);
  if (providerIcon) {
    return providerIcon;
  }

  const key = PROVIDER_ID_ALIASES[providerId] ?? providerId;
  return resolveModelAssetIcon(key);
}

export function resolveModelProviderIcon(
  modelId: string,
  providerId: string,
): IconSource | undefined {
  return resolveModelToProviderIcon(modelId) ?? resolveProviderIcon(providerId);
}

export function resolveIcon(modelId: string, providerId: string): IconSource | undefined {
  return (
    resolveModelIcon(modelId) ??
    resolveModelToProviderIcon(modelId) ??
    resolveProviderIcon(providerId)
  );
}
