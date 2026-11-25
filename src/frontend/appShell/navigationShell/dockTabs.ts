import {
  NAVIGATION_PINNABLE_TAB_IDS,
  type NavigationPinTabId,
} from '@/shared/data/preference/preferenceSchema';

import {
  getNavHref,
  getNavStackRoute,
  getNavTitleKey,
  type MoreModuleId,
  NAV_DESTINATION_IDS,
  NAV_ROUTE_MANIFEST,
  type NavDestinationId,
  type NavRouteSpec,
  type NavTabId,
} from './navRouteManifest';

export {
  getNavHref,
  getNavStackRoute,
  getNavTitleKey,
  NAV_DESTINATION_IDS,
  NAV_ROUTE_MANIFEST,
  type MoreModuleId,
  type NavDestinationId,
  type NavRouteSpec,
  type NavTabId,
};

export type DockDragPreviewInput = {
  draggingOut: boolean;
  id: NavigationPinTabId;
  insertIndex: number;
  overDock: boolean;
  source: 'dock' | 'more';
};

export type DockDragPreviewState = {
  canDrop: boolean;
  isFull: boolean;
  previewTabId: NavigationPinTabId | null;
  tabs: NavTabId[];
};

export const DEFAULT_PINNED_TABS: readonly NavigationPinTabId[] = ['agents'];
export const MAX_MIDDLE_TABS = 3;
export const MAX_DOCK_TABS = MAX_MIDDLE_TABS + 2;

export const MORE_MODULE_IDS: readonly MoreModuleId[] = [
  'drawings',
  'plugins',
  'marketplace',
  'files',
  'devices',
] as const;

export const WIDE_RAIL_DESTINATIONS: readonly ('chat' | NavigationPinTabId)[] = [
  'chat',
  'agents',
  'drawings',
  'plugins',
  'marketplace',
  'files',
  'devices',
] as const;

const PINNABLE_SET = new Set<string>(NAVIGATION_PINNABLE_TAB_IDS);
const MORE_MODULE_SET = new Set<string>(MORE_MODULE_IDS);
const REQUIRED_MIDDLE_TABS = new Set<NavigationPinTabId>(['agents']);

const ROOT_PATHNAME_TO_DEST: readonly [string, NavDestinationId][] = NAV_DESTINATION_IDS.flatMap(
  (id) =>
    NAV_ROUTE_MANIFEST[id].pathPrefixes.map((prefix): [string, NavDestinationId] => [prefix, id]),
);

const EXACT_ROOT_PATHNAMES = new Set<string>(
  NAV_DESTINATION_IDS.flatMap((id) => NAV_ROUTE_MANIFEST[id].exactRootPathnames),
);

/** Sanitizes persisted middle tabs: valid pinnable IDs, unique, `agents` always kept, capped at 3. */
export function normalizePinnedTabs(raw: readonly string[] | undefined): NavigationPinTabId[] {
  const unique: NavigationPinTabId[] = [];
  for (const item of raw ?? []) {
    if (PINNABLE_SET.has(item)) {
      const typed = item as NavigationPinTabId;
      if (!unique.includes(typed)) unique.push(typed);
    }
  }
  if (!unique.includes('agents')) {
    unique.unshift('agents');
  }
  return unique.slice(0, MAX_MIDDLE_TABS);
}

export function canPinTab(
  pinnedTabs: readonly NavigationPinTabId[],
  id: NavigationPinTabId,
): boolean {
  const normalized = normalizePinnedTabs(pinnedTabs);
  return !normalized.includes(id) && normalized.length < MAX_MIDDLE_TABS;
}

export function canUnpinTab(
  pinnedTabs: readonly NavigationPinTabId[],
  id: NavigationPinTabId,
): boolean {
  const normalized = normalizePinnedTabs(pinnedTabs);
  return !REQUIRED_MIDDLE_TABS.has(id) && normalized.includes(id);
}

export function pinTab(
  pinnedTabs: readonly NavigationPinTabId[],
  id: NavigationPinTabId,
  insertIndex?: number,
): NavigationPinTabId[] {
  const normalized = normalizePinnedTabs(pinnedTabs);
  if (normalized.includes(id) || normalized.length >= MAX_MIDDLE_TABS) return normalized;
  const boundedIndex =
    insertIndex === undefined
      ? normalized.length
      : Math.max(0, Math.min(normalized.length, insertIndex));
  const next = [...normalized];
  next.splice(boundedIndex, 0, id);
  return next;
}

export function unpinTab(
  pinnedTabs: readonly NavigationPinTabId[],
  id: NavigationPinTabId,
): NavigationPinTabId[] {
  const normalized = normalizePinnedTabs(pinnedTabs);
  if (!canUnpinTab(normalized, id)) return normalized;
  return normalized.filter((item) => item !== id);
}

export function reorderPinnedTab(
  pinnedTabs: readonly NavigationPinTabId[],
  id: NavigationPinTabId,
  targetIndex: number,
): NavigationPinTabId[] {
  const normalized = normalizePinnedTabs(pinnedTabs);
  const from = normalized.indexOf(id);
  if (from < 0) return normalized;
  const to = Math.max(0, Math.min(normalized.length - 1, targetIndex));
  if (from === to) return normalized;
  const next = [...normalized];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Resolves the 3–5 bottom/vertical dock tabs with locked `chat` and `more` bookends. */
export function resolveDockTabs(pinnedTabs: readonly NavigationPinTabId[]): NavTabId[] {
  return ['chat', ...normalizePinnedTabs(pinnedTabs), 'more'];
}

/** Computes the live post-drop dock layout shown while dragging a module or dock tab. */
export function resolveDockDragPreview(
  pinnedTabs: readonly NavigationPinTabId[],
  drag: DockDragPreviewInput | null,
): DockDragPreviewState {
  const normalized = normalizePinnedTabs(pinnedTabs);
  if (!drag) {
    return {
      canDrop: false,
      isFull: false,
      previewTabId: null,
      tabs: resolveDockTabs(normalized),
    };
  }

  if (drag.source === 'more') {
    const canPin = canPinTab(normalized, drag.id);
    if (!drag.overDock || !canPin) {
      return {
        canDrop: false,
        isFull: !canPin,
        previewTabId: null,
        tabs: resolveDockTabs(normalized),
      };
    }

    return {
      canDrop: true,
      isFull: false,
      previewTabId: drag.id,
      tabs: resolveDockTabs(pinTab(normalized, drag.id, drag.insertIndex)),
    };
  }

  if (drag.draggingOut) {
    if (canUnpinTab(normalized, drag.id)) {
      return {
        canDrop: true,
        isFull: false,
        previewTabId: null,
        tabs: resolveDockTabs(unpinTab(normalized, drag.id)),
      };
    }

    return {
      canDrop: false,
      isFull: false,
      previewTabId: drag.id,
      tabs: resolveDockTabs(normalized),
    };
  }

  const nextPinned = drag.overDock
    ? reorderPinnedTab(normalized, drag.id, drag.insertIndex)
    : normalized;

  return {
    canDrop: drag.overDock,
    isFull: false,
    previewTabId: drag.id,
    tabs: resolveDockTabs(nextPinned),
  };
}

/** Modules shown inside 「更多」 remain mutually exclusive with pinned dock tabs. */
export function resolveMoreModules(pinnedTabs: readonly NavigationPinTabId[]): MoreModuleId[] {
  const pinned = new Set(normalizePinnedTabs(pinnedTabs));
  return MORE_MODULE_IDS.filter((id) => !pinned.has(id));
}

export function isMoreModuleId(id: string): id is MoreModuleId {
  return MORE_MODULE_SET.has(id);
}

/** Maps a drawer-shell pathname to its top-level navigation destination, if any. */
export function resolveNavDestination(pathname: string): NavDestinationId | undefined {
  return ROOT_PATHNAME_TO_DEST.find(
    ([root]) => pathname === root || (root !== '/' && pathname.startsWith(`${root}/`)),
  )?.[1];
}

/** True only when at a first-level destination root where compact floating dock stays visible. */
export function isRootNavPathname(pathname: string): boolean {
  return EXACT_ROOT_PATHNAMES.has(pathname);
}

/** Compact dock highlights the matching pinned tab, or falls back to `more` for unpinned modules. */
export function resolveActiveDockTab(
  destination: NavDestinationId | undefined,
  pinnedTabs: readonly NavigationPinTabId[],
): NavTabId | undefined {
  if (!destination || destination === 'settings') return undefined;
  const tabs = new Set<NavTabId>(resolveDockTabs(pinnedTabs));
  return tabs.has(destination) ? destination : 'more';
}

export function isUnpinnedModuleRoot(
  pathname: string,
  pinnedTabs: readonly NavigationPinTabId[],
): boolean {
  if (!isRootNavPathname(pathname)) return false;
  const dest = resolveNavDestination(pathname);
  if (!dest || dest === 'chat' || dest === 'more' || dest === 'settings') return false;
  return !normalizePinnedTabs(pinnedTabs).includes(dest);
}

/**
 * Leading action on compact screens:
 * - Chat, More, and pinned top-level roots open the left drawer (`drawer`)
 * - Unpinned module roots opened from 「更多」 lead with `back` to return to 「更多」
 */
export function resolveCompactLeadingAction(
  pathname: string,
  pinnedTabs: readonly NavigationPinTabId[],
): 'drawer' | 'back' {
  if (!isRootNavPathname(pathname)) return 'back';
  return isUnpinnedModuleRoot(pathname, pinnedTabs) ? 'back' : 'drawer';
}
