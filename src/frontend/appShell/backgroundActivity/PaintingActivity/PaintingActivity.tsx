import type { LiveActivityFactory } from 'expo-widgets';

import type { PaintingActivityProps } from '@/shared/backgroundActivity/painting';

/**
 * Live Activities are iOS-only; other platforms resolve this module instead
 * of the `.ios.tsx` layout and composition falls back to the no-op presenter.
 * (The layout module cannot be imported off iOS: `createLiveActivity` touches
 * the expo-widgets native module at import time.)
 */
const PaintingActivity: LiveActivityFactory<PaintingActivityProps> | undefined = undefined;

export default PaintingActivity;
