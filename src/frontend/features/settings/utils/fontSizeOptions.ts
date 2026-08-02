import type { FontSizeStep } from '@/shared/data/preference';

export const FONT_SIZE_STEP_LABEL_KEYS = {
  0: 'settings.fontSize.level.standard',
  1: 'settings.fontSize.level.large',
  2: 'settings.fontSize.level.extraLarge',
} as const satisfies Record<FontSizeStep, string>;
