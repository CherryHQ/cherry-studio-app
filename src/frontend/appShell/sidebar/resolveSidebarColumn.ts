import { isAcross, resolveFilePaneWidth, windowRegionWidths } from '@/frontend/appShell/layout';

import type { FoldRegion } from '../../../../modules/fold-region';

/** What the window's left column shows beside the content region. */
export type SidebarColumnContent = 'sidebar' | 'search';

/**
 * How the sidebar meets the content region. A wide window keeps a permanent column; when the file
 * pane takes that column beside the chat, the sidebar steps aside like a closed overlay.
 */
export type SidebarColumn =
  | { kind: 'overlay' }
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
 * pane does; flat, the column keeps its regular width for its content.
 */
export function resolveSidebarColumn({
  content,
  fold,
  insetLeft,
  insetRight,
  isPaneInColumn,
  isWide,
  windowWidth,
}: SidebarColumnInput): SidebarColumn {
  if (!isWide) return { kind: 'overlay' };
  if (isPaneInColumn) return { kind: 'yielded' };

  if (fold && fold.isActive && !isAcross(fold)) {
    const end = fold.x + fold.width;
    if (fold.x > 0 && end < windowWidth) {
      return { content, foldGap: fold.width, kind: 'permanent', width: end };
    }
  }

  const contentWidth =
    content === 'search'
      ? resolveFilePaneWidth(windowWidth - insetLeft - insetRight)
      : windowRegionWidths.sidebar;
  return { content, foldGap: 0, kind: 'permanent', width: insetLeft + contentWidth };
}
