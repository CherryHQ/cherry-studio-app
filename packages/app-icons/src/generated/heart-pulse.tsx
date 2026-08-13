import { createIcon } from '../createIcon';

/**
 * HeartPulseIcon — SF `heart` / Material `monitor_heart` (was lucide `heart-pulse`).
 * DRIFT: Health-permission heart: iOS drops the pulse line (Health-app metaphor is the bare heart).
 */
export default createIcon({ displayName: 'HeartPulseIcon', sf: 'heart', glyph: '\ueaa2' });
