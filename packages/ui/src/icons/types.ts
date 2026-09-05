import type { GENERAL_ICONS } from '../icons-webp/general';
import type { MODEL_ICONS } from '../icons-webp/models';
import type { PROVIDER_ICONS } from '../icons-webp/providers';
import type { IconSource } from '../icons-webp/types';

export type { IconSource };

export type GeneralIconKey = keyof typeof GENERAL_ICONS;
export type ModelIconKey = keyof typeof MODEL_ICONS;
export type ProviderIconKey = keyof typeof PROVIDER_ICONS;
