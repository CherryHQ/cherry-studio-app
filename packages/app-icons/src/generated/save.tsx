import { createIcon } from '../createIcon';

/**
 * SaveIcon — SF `square.and.arrow.down` / Material `save` (was lucide `save`).
 * DRIFT: SF Symbols has no floppy disk; iOS uses the save-into-box arrow.
 */
export default createIcon({
  displayName: 'SaveIcon',
  sf: 'square.and.arrow.down',
  glyph: '\ue161',
});
