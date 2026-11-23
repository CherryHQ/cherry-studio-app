/** Sidebar entries that open a page in the content region instead of a conversation. */
export type SidebarDestination =
  | 'agents'
  | 'devices'
  | 'library'
  | 'more'
  | 'paintings'
  | 'plugins'
  | 'settings'
  | 'scheduled-tasks'
  | 'skills';

const destinationRoots: readonly [string, SidebarDestination][] = [
  ['/agents', 'agents'],
  ['/devices', 'devices'],
  ['/drawings', 'paintings'],
  ['/paintings', 'paintings'],
  ['/plugins', 'plugins'],
  ['/skills', 'skills'],
  ['/library', 'library'],
  ['/trash', 'library'],
  ['/more', 'more'],
  ['/settings', 'settings'],
  ['/scheduled-tasks', 'scheduled-tasks'],
];

/** The entry whose page, or a page beneath it, fills the content region. */
export function resolveSidebarDestination(pathname: string): SidebarDestination | undefined {
  return destinationRoots.find(
    ([root]) => pathname === root || pathname.startsWith(`${root}/`),
  )?.[1];
}
