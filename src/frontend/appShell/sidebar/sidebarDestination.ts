/** Sidebar entries that open a page in the content region instead of a conversation. */
export type SidebarDestination =
  | 'agents'
  | 'library'
  | 'paintings'
  | 'plugins'
  | 'settings'
  | 'skills';

const destinationRoots: readonly [string, SidebarDestination][] = [
  ['/agents', 'agents'],
  ['/drawings', 'paintings'],
  ['/paintings', 'paintings'],
  ['/plugins', 'plugins'],
  ['/skills', 'skills'],
  ['/library', 'library'],
  ['/trash', 'library'],
  ['/settings', 'settings'],
];

/** The entry whose page, or a page beneath it, fills the content region. */
export function resolveSidebarDestination(pathname: string): SidebarDestination | undefined {
  return destinationRoots.find(
    ([root]) => pathname === root || pathname.startsWith(`${root}/`),
  )?.[1];
}
