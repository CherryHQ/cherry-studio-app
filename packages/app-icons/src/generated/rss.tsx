import { createIcon } from '../createIcon';

/**
 * RssIcon — SF `dot.radiowaves.up.forward` / Material `rss_feed` (was lucide `rss`).
 * DRIFT: SF Symbols has no RSS glyph; iOS shows forward radiowaves.
 */
export default createIcon({
  displayName: 'RssIcon',
  sf: 'dot.radiowaves.up.forward',
  glyph: '\ue0e5',
});
