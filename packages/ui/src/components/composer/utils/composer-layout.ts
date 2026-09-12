// Geometry shared by the root and its sub-components. These are measured
// values, not guesses — the comments record what each one was derived from, so
// changing one without re-measuring will visibly break the alignment.

const actionIconSize = 24;
/** The toolbar buttons: a circle sized to its icon rather than to its reach. */
export const composerActionSize = actionIconSize + 8;
// A 32pt radius keeps the 56pt resting surface on the shared radius scale and
// gives its corners a continuous capsule silhouette without enlarging actions.
export const surfaceRadius = 32;
// The toolbar's buttons carry their own surface, so the padding is measured to
// their edge rather than to their icons' ink.
const surfacePaddingHorizontal = 12;
const surfacePaddingTop = 12;
const surfacePaddingBottom = 12;
const toolbarGap = 12;
// Between the tools themselves. Narrower than the gap above the row: they are
// one band, and the row is a separate thing from the field.
const toolbarItemGap = 8;
// A pill's text needs more air either side than a glyph does: the icon in a 32pt
// circle already sits 4pt in from the edge, and matching that on a label reads as
// cramped. 10 is what the model button this replaces has always shipped.
const pillPaddingHorizontal = 10;
// Narrower than the toolbar's own gap so an icon and its label read as one thing
// rather than as two tools that happen to be adjacent.
const pillGap = 6;
// Taken from the chat input this replaces rather than re-derived: a cap is a
// judgement about how much of the conversation the composer may eat, and that
// one has shipped. It lands mid-line on both platforms, which is useful — a
// clipped glyph row is what tells the reader the field scrolls.
const maxTextHeight = 132;
// Symmetric on purpose: asymmetric padding would only trade the glyphs'
// centering for the caret's. See `composer-text-style.ios`.
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
  borderCurve: 'continuous',
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
// Height, not size: a pill is as wide as what it carries. It shares the action's
// height so a row of both reads as one band.
export const pillStyle = {
  alignItems: 'center',
  flexDirection: 'row',
  gap: pillGap,
  height: composerActionSize,
  paddingHorizontal: pillPaddingHorizontal,
} as const;
export const textInputBoxStyle = {
  maxHeight: maxTextHeight,
  paddingVertical: textPaddingVertical,
} as const;
// The paste wrapper shrink-wraps its child by default, which would pull the
// field in from the surface's right edge and leave the caret short of it.
export const pasteWrapperStyle = { alignSelf: 'stretch' } as const;
export const toolbarStyle = { gap: toolbarItemGap, marginTop: toolbarGap } as const;
