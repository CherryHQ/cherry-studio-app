import { createIcon } from '../createIcon';

/**
 * BotIcon — SF `brain.head.profile` / Material `smart_toy` (was lucide `bot`).
 * DRIFT: SF Symbols has no robot; iOS shows a thinking head, Android keeps a robot toy.
 */
export default createIcon({ displayName: 'BotIcon', sf: 'brain.head.profile', glyph: '\uf06c' });
