export type ComposerPopoverFrame = { left: number; top: number; width: number; height: number };

/** Regions cover the viewport except the live composer. The panel renders above them. */
export function getComposerPopoverLayout({
  anchor,
  fontScale,
  insets,
  keyboardHeight,
  windowHeight,
  windowWidth,
}: {
  anchor: ComposerPopoverFrame;
  fontScale: number;
  insets: { top: number; right: number; bottom: number; left: number };
  keyboardHeight: number;
  windowHeight: number;
  windowWidth: number;
}) {
  'worklet';
  const anchorTop = Math.max(0, Math.min(anchor.top, windowHeight));
  const anchorBottom = Math.max(anchorTop, Math.min(anchor.top + anchor.height, windowHeight));
  const anchorLeft = Math.max(0, Math.min(anchor.left, windowWidth));
  const anchorRight = Math.max(anchorLeft, Math.min(anchor.left + anchor.width, windowWidth));
  const top = insets.top + 8;
  const viewportBottom = Math.max(top, windowHeight - Math.max(insets.bottom, keyboardHeight) - 8);
  const preferredBottom = Math.max(top, Math.min(anchorTop - 8, viewportBottom));
  // In unusually short windows, use the remaining viewport above the keyboard
  // instead of squeezing the picker to zero. Its entire content must scroll.
  const minimumHeight = Math.min(160 * Math.max(1, fontScale), viewportBottom - top);
  const bottom = preferredBottom - top >= minimumHeight ? preferredBottom : viewportBottom;
  const width = Math.max(0, Math.min(anchor.width, windowWidth - insets.left - insets.right - 16));
  const left = Math.max(
    insets.left + 8,
    Math.min(anchor.left, windowWidth - insets.right - 8 - width),
  );

  return {
    panel: { left, top, width, height: Math.max(0, bottom - top) },
    outside: [
      { left: 0, top: 0, width: windowWidth, height: anchorTop },
      { left: 0, top: anchorBottom, width: windowWidth, height: windowHeight - anchorBottom },
      { left: 0, top: anchorTop, width: anchorLeft, height: anchorBottom - anchorTop },
      {
        left: anchorRight,
        top: anchorTop,
        width: windowWidth - anchorRight,
        height: anchorBottom - anchorTop,
      },
    ],
  };
}
