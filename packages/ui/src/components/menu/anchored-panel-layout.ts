import type { MenuAnchor } from './menu.types';

/** Window-space placement shared by action menus and informational popovers. */
export function getAnchoredPanelLayout({
  anchor,
  height,
  insets,
  panelHeight,
  preferredMaxHeight,
  preferredWidth,
  width,
}: {
  anchor: MenuAnchor;
  height: number;
  insets: { top: number; bottom: number; left: number; right: number };
  panelHeight: number;
  preferredMaxHeight: number;
  preferredWidth: number;
  width: number;
}) {
  const topInset = insets.top + 16;
  const bottomEdge = height - insets.bottom - 16;
  const maxHeight = Math.max(0, Math.min(preferredMaxHeight, bottomEdge - topInset));
  const panelWidth = Math.max(0, Math.min(preferredWidth, width - insets.left - insets.right - 32));
  const visibleHeight = Math.min(panelHeight, maxHeight);
  const spaceBelow = bottomEdge - anchor.pageY - anchor.height - 8;
  const opensAbove = spaceBelow < visibleHeight && anchor.pageY - topInset - 8 > spaceBelow;
  const top = Math.max(
    topInset,
    Math.min(
      opensAbove ? anchor.pageY - visibleHeight - 8 : anchor.pageY + anchor.height + 8,
      bottomEdge - visibleHeight,
    ),
  );
  const preferredLeft =
    anchor.width === 0 && anchor.height === 0
      ? anchor.pageX
      : anchor.pageX + anchor.width - panelWidth;
  const left = Math.max(
    insets.left + 16,
    Math.min(preferredLeft, width - insets.right - 16 - panelWidth),
  );

  return { left, maxHeight, opensAbove, top, visibleHeight, width: panelWidth };
}
