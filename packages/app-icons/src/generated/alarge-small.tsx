import { createIcon } from '../createIcon';

/**
 * ALargeSmallIcon — SF `textformat.size` / Material `format_size` (was lucide `alarge-small`).
 * DRIFT: Font-size metaphor rendered as "A" sizes on both platforms, not lucide's a/A pair.
 */
export default createIcon({
  displayName: 'ALargeSmallIcon',
  sf: 'textformat.size',
  glyph: '\ue245',
});
