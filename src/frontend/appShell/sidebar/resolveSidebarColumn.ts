import {
  type FoldRegion,
  isAcross,
  resolveFilePaneWidth,
  windowRegionWidths,
} from '@/frontend/appShell/layout';

/** What the window's left column shows beside the content region. */
export type SidebarColumnContent = 'sidebar' | 'search';

/**
 * How the sidebar meets the content region. A wide window keeps a permanent column unless the user
 * collapsed it; when the file pane takes that column beside the chat, the sidebar steps aside. Both
 * leave the sidebar mounted without reserving space for it, as do pages over a compact chat.
 */
export type SidebarColumn =
  | { kind: 'overlay' }
  | { kind: 'inactive' }
  | { kind: 'collapsed' }
  | { kind: 'yielded' }
  | {
      kind: 'permanent';
      content: SidebarColumnContent;
      /** Column width, including the leading safe area and any fold it reaches across. */
      width: number;
      /** Empty space at the column's trailing edge where a fold divides the window. */
      foldGap: number;
    };

type SidebarColumnInput = {
  isWide: boolean;
  isChatFocused: boolean;
  /** Compact roots like 「更多」 and pinned tabs can also open the overlay drawer. */
  canOpenCompactDrawer?: boolean;
  /** The user hid the column; only a wide window has one to hide. */
  isCollapsed: boolean;
  /** The file pane is open beside a focused chat and holds the left column. */
  isPaneInColumn: boolean;
  content: SidebarColumnContent;
  windowWidth: number;
  insetLeft: number;
  insetRight: number;
  fold: FoldRegion | null;
};

/**
 * Lists and the content region meet at a fold whenever the device is partly folded, as the file
 * pane does; a flat device reports no fold, and the column keeps its regular width for its content. The fold sets the layout
 * while it divides the window: hiding the column would leave the chat straddling it, so a collapsed
 * sidebar returns until the device lies flat again.
 */
export function resolveSidebarColumn({
  canOpenCompactDrawer,
  content,
  fold,
  insetLeft,
  insetRight,
  isChatFocused,
  isCollapsed,
  isWide,
  windowWidth,
}: SidebarColumnInput): SidebarColumn {
  if (!isWide) {
    return { kind: (canOpenCompactDrawer ?? isChatFocused) ? 'overlay' : 'inactive' };
  }
  if (!isChatFocused) return { kind: 'inactive' };

  if (fold && !isAcross(fold)) {
    const end = fold.x + fold.width;
    if (fold.x > 0 && end < windowWidth) {
      return { content, foldGap: fold.width, kind: 'permanent', width: end };
    }
  }

  if (isCollapsed) return { kind: 'collapsed' };

  const contentWidth =
    content === 'search'
      ? resolveFilePaneWidth(windowWidth - insetLeft - insetRight)
      : windowRegionWidths.sidebar;
  return { content, foldGap: 0, kind: 'permanent', width: insetLeft + contentWidth };
}

const MIN_OVERLAY_WIDTH = 280;

/**
 * Compact overlay drawers span the full available window width inside the trailing safe area
 * (such as a foldable display's trailing OS bar), without leaving a reveal strip or width cap.
 */
export function resolveSidebarOverlayWidth(windowWidth: number, trailingInset = 0): number {
  return Math.max(MIN_OVERLAY_WIDTH, windowWidth - trailingInset);
}

/** Keep an inactive sidebar mounted without flashing or flipping drawer modes on push/pop. */
export function resolveSidebarDrawer(column: SidebarColumn, overlayWidth: number, isWide = true) {
  if (column.kind === 'overlay') {
    return {
      drawerType: 'front',
      drawerStyle: { pointerEvents: 'auto', width: overlayWidth },
    } as const;
  }
  if (column.kind === 'permanent') {
    return { drawerType: 'permanent', drawerStyle: { width: column.width } } as const;
  }
  if (!isWide) {
    // Keep compact drawers in `front` mode across secondary routes so native drawer
    // physics and gesture listeners never tear down on navigation transitions.
    return {
      drawerType: 'front',
      drawerStyle: { pointerEvents: 'none', width: overlayWidth },
    } as const;
  }
  // Keep the list laid out off the flex row, and the closed position ready for a narrower window.
  return {
    drawerType: 'permanent',
    drawerStyle: { position: 'absolute', opacity: 0, pointerEvents: 'none', width: overlayWidth },
  } as const;
}

/**
 * What the header's sidebar button does for a column: open the overlay, hide or show a permanent
 * column. A column yielded to the file pane, or sized to a fold, has no button.
 */
export type SidebarToggleAction = 'open' | 'hide' | 'show';

export function resolveSidebarToggleAction(column: SidebarColumn): SidebarToggleAction | undefined {
  switch (column.kind) {
    case 'overlay':
      return 'open';
    case 'collapsed':
      return 'show';
    case 'permanent':
      return column.foldGap > 0 ? undefined : 'hide';
    case 'inactive':
    case 'yielded':
      return undefined;
  }
}
