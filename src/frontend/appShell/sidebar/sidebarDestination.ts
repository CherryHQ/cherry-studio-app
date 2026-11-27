import {
  NAV_DESTINATION_IDS,
  NAV_ROUTE_MANIFEST,
  type NavRouteSpec,
  type SidebarNavDestination,
} from '@/frontend/appShell/navigationShell/state';

/** Sidebar entries that open a page in the content region instead of a conversation. */
export type SidebarDestination = SidebarNavDestination | 'scheduled-tasks';

const manifestRoots: readonly [string, SidebarDestination][] = NAV_DESTINATION_IDS.flatMap((id) => {
  const entry: NavRouteSpec = NAV_ROUTE_MANIFEST[id];
  if (!entry.sidebarDestination) return [];
  const destination: SidebarDestination = entry.sidebarDestination;
  return entry.pathPrefixes.map((prefix): [string, SidebarDestination] => [prefix, destination]);
});

const destinationRoots: readonly [string, SidebarDestination][] = [
  ...manifestRoots,
  ['/scheduled-tasks', 'scheduled-tasks'],
];

/** The entry whose page, or a page beneath it, fills the content region. */
export function resolveSidebarDestination(pathname: string): SidebarDestination | undefined {
  return destinationRoots.find(
    ([root]) => pathname === root || pathname.startsWith(`${root}/`),
  )?.[1];
}
