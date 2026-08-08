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
const maxTextHeight = 120;
// Symmetric on purpose: asymmetric padding would only trade the glyphs'
// centering for the caret's. See `composerTextStyle.ios`.
const textPaddingVertical = 4;
// The circle is well under the 44pt minimum on its own, so the rest of the
// target comes from slop rather than from a bigger shape.
export const actionHitSlop = (44 - composerActionSize) / 2;

// Everything inside sits flush against the surface's own padding — one left edge
// for the buttons, the field, and whatever rows a caller stacks above them. The
// alternative is to indent the text to line its ink up with the icons' (lucide
// draws its 24pt icons with ~4pt of margin inside the box), which is what this
// did until the toolbar buttons grew visible tinted circles. A circle's edge is
// what the eye lines up against, not the glyph inside it, and a row above the
// field is as likely to be a filled pill as it is to be text.

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
export const textInputBoxStyle = {
  maxHeight: maxTextHeight,
  paddingVertical: textPaddingVertical,
} as const;
export const toolbarStyle = { marginTop: toolbarGap } as const;
