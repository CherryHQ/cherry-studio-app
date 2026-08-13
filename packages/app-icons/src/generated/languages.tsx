import { createIcon } from '../createIcon';

/**
 * LanguagesIcon — SF `character.bubble` / Material `translate` (was lucide `languages`).
 * DRIFT: SF Symbols has no translate glyph; iOS shows a character bubble.
 */
export default createIcon({
  displayName: 'LanguagesIcon',
  sf: 'character.bubble',
  glyph: '\ue8e2',
});
