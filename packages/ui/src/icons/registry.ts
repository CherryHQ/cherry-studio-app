import { resolveGeneralIcon } from '../icons-png/general';
import { MODEL_ICONS, type ModelIconKey, resolveModelAssetIcon } from '../icons-png/models';
import { resolveProviderAssetIcon } from '../icons-png/providers';
import {
  MODEL_ICON_PATTERNS,
  MODEL_TO_PROVIDER_ICON_PATTERNS,
  PROVIDER_ID_ALIASES,
} from './desktop-routing';
import type { IconPngSource } from './types';

export { resolveGeneralIcon };

export function resolveModelIcon(modelId: string): IconPngSource | undefined {
  if (!modelId) return undefined;

  for (const [regex, catalogKey] of MODEL_ICON_PATTERNS) {
    if (regex.test(modelId)) {
      return MODEL_ICONS[catalogKey as ModelIconKey] ?? resolveModelAssetIcon(catalogKey);
    }
  }

  return undefined;
}

export function resolveModelToProviderIcon(modelId: string): IconPngSource | undefined {
  if (!modelId) return undefined;

  for (const [regex, providerId] of MODEL_TO_PROVIDER_ICON_PATTERNS) {
    if (regex.test(modelId)) {
      return resolveProviderIcon(providerId);
    }
  }

  return undefined;
}

export function resolveProviderIcon(providerId: string): IconPngSource | undefined {
  if (!providerId) return undefined;

  if (providerId === 'opencode') {
    return resolveGeneralIcon('open-code');
  }

  const key = PROVIDER_ID_ALIASES[providerId] ?? providerId;

  return resolveProviderAssetIcon(key) ?? resolveModelAssetIcon(key);
}

export function resolveModelProviderIcon(
  modelId: string,
  providerId: string,
): IconPngSource | undefined {
  return resolveModelToProviderIcon(modelId) ?? resolveProviderIcon(providerId);
}

export function resolveIcon(modelId: string, providerId: string): IconPngSource | undefined {
  return (
    resolveModelIcon(modelId) ??
    resolveModelToProviderIcon(modelId) ??
    resolveProviderIcon(providerId)
  );
}
