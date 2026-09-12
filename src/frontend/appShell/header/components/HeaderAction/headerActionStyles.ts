import type { HeaderActionTargetSize } from './HeaderAction.types';

export const HEADER_ACTION_BASE_CLASS_NAME = 'items-center justify-center rounded-full';

export const HEADER_ICON_ACTION_CLASS_NAMES: Record<HeaderActionTargetSize, string> = {
  surface: `size-10 ${HEADER_ACTION_BASE_CLASS_NAME}`,
  'touch-target': `size-12 ${HEADER_ACTION_BASE_CLASS_NAME}`,
};
