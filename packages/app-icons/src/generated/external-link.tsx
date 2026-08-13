import { createIcon } from '../createIcon';

/**
 * ExternalLinkIcon — SF `arrow.up.right.square` / Material `open_in_new` (was lucide `external-link`).
 * DRIFT: Arrow leaves a square instead of lucide's broken-corner box; same open-elsewhere reading.
 */
export default createIcon({
  displayName: 'ExternalLinkIcon',
  sf: 'arrow.up.right.square',
  glyph: '\ue89e',
});
