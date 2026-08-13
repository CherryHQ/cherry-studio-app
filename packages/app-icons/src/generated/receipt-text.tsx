import { createIcon } from '../createIcon';

/**
 * ReceiptTextIcon — SF `list.bullet.rectangle.portrait` / Material `receipt_long` (was lucide `receipt-text`).
 * DRIFT: SF Symbols has no receipt; iOS shows a bulleted document.
 */
export default createIcon({
  displayName: 'ReceiptTextIcon',
  sf: 'list.bullet.rectangle.portrait',
  glyph: '\uef6e',
});
