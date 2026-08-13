import { createIcon } from '../createIcon';

/**
 * RotateCwIcon — SF `arrow.clockwise` / Material `rotate_right` (was lucide `rotate-cw`).
 * DRIFT: Converges with RefreshCwIcon on iOS: both collapse to the clockwise arrow.
 */
export default createIcon({ displayName: 'RotateCwIcon', sf: 'arrow.clockwise', glyph: '\ue41a' });
