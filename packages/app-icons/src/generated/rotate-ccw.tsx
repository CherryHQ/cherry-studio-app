import { createIcon } from '../createIcon';

/**
 * RotateCcwIcon — SF `arrow.counterclockwise` / Material `replay` (was lucide `rotate-ccw`).
 * DRIFT: Converges with RefreshCcwIcon on iOS: both collapse to the counterclockwise arrow.
 */
export default createIcon({
  displayName: 'RotateCcwIcon',
  sf: 'arrow.counterclockwise',
  glyph: '\ue042',
});
