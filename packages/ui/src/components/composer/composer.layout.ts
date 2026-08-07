// Geometry shared by the root and its sub-components. These are measured
// values, not guesses — the comments record what each one was derived from, so
// changing one without re-measuring will visibly break the alignment.

const actionIconSize = 24;
/** The toolbar buttons: a circle sized to its icon rather than to its reach. */
export const composerActionSize = actionIconSize + 8;
export const surfaceRadius = 24;
// The toolbar's buttons carry their own surface, so the padding is measured to
// their edge rather than to their icons' ink.
const surfacePaddingHorizontal = 12;
const surfacePaddingTop = 8;
const surfacePaddingBottom = 8;
const toolbarGap = 12;
export const thumbnailSize = 120;
const maxTextHeight = 120;
// Symmetric on purpose: asymmetric padding would only trade the glyphs'
// centering for the caret's. See `composerTextStyle.ios`.
const textPaddingVertical = 4;
// Lines the text's ink up with the icons' — their boxes are not the same thing,
// since lucide draws its 24pt icons with ~4pt of margin inside the box. Aligning
// the boxes instead leaves the toolbar looking indented from the text above it.
const iconInkMargin = 4;
export const textPaddingHorizontal = (composerActionSize - actionIconSize) / 2 + iconInkMargin;
// The circle is well under the 44pt minimum on its own, so the rest of the
// target comes from slop rather than from a bigger shape.
export const actionHitSlop = (44 - composerActionSize) / 2;

// Geometry lives in `style`, not className: GlassView doesn't take className, so
// this is the only way both surface branches stay pixel-identical.
export const surfaceStyle = {
  paddingBottom: surfacePaddingBottom,
  paddingHorizontal: surfacePaddingHorizontal,
  paddingTop: surfacePaddingTop,
} as const;
export const actionStyle = {
  alignItems: 'center',
  height: composerActionSize,
  justifyContent: 'center',
  width: composerActionSize,
} as const;
export const stripRowStyle = { paddingHorizontal: textPaddingHorizontal } as const;
export const thumbnailStyle = { height: thumbnailSize, width: thumbnailSize } as const;
export const textInputBoxStyle = {
  maxHeight: maxTextHeight,
  paddingHorizontal: textPaddingHorizontal,
  paddingVertical: textPaddingVertical,
} as const;
export const toolbarStyle = { marginTop: toolbarGap } as const;
