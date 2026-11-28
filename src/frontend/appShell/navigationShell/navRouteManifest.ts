import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

export type NavTabId = 'chat' | NavigationPinTabId | 'more';
export type NavDestinationId = NavTabId | 'settings';
export type MoreModuleId = Exclude<NavigationPinTabId, 'agents'>;

export type SidebarNavDestination =
  | 'agents'
  | 'devices'
  | 'library'
  | 'more'
  | 'paintings'
  | 'plugins'
  | 'settings'
  | 'skills';

export type NavRouteSpec = {
  exactRootPathnames: readonly string[];
  href: string;
  pathPrefixes: readonly string[];
  sidebarDestination?: SidebarNavDestination;
  stackRoute: string;
  titleKey: string;
};

/**
 * Single source of truth for top-level destinations in the drawer shell:
 * route names, hrefs, path prefixes, dock root detection, sidebar highlight mapping, and titles.
 */
export const NAV_ROUTE_MANIFEST = {
  chat: {
    exactRootPathnames: ['/', '/remote'],
    href: '/',
    pathPrefixes: ['/', '/remote', '/scheduled-tasks'],
    stackRoute: '(chat)',
    titleKey: 'navigation.chat',
  },
  agents: {
    exactRootPathnames: ['/agents'],
    href: '/agents',
    pathPrefixes: ['/agents'],
    sidebarDestination: 'agents',
    stackRoute: 'agents',
    titleKey: 'navigation.agents',
  },
  drawings: {
    exactRootPathnames: ['/drawings'],
    href: '/drawings',
    pathPrefixes: ['/drawings', '/paintings'],
    sidebarDestination: 'paintings',
    stackRoute: 'drawings',
    titleKey: 'navigation.paintings',
  },
  plugins: {
    exactRootPathnames: ['/plugins'],
    href: '/plugins',
    pathPrefixes: ['/plugins'],
    sidebarDestination: 'plugins',
    stackRoute: 'plugins',
    titleKey: 'plugins.title',
  },
  marketplace: {
    exactRootPathnames: ['/skills'],
    href: '/skills',
    pathPrefixes: ['/skills'],
    sidebarDestination: 'skills',
    stackRoute: 'skills',
    titleKey: 'marketplace.title',
  },
  files: {
    exactRootPathnames: ['/library'],
    href: '/library',
    pathPrefixes: ['/library', '/trash'],
    sidebarDestination: 'library',
    stackRoute: 'library',
    titleKey: 'navigation.library',
  },
  devices: {
    exactRootPathnames: ['/devices'],
    href: '/devices',
    pathPrefixes: ['/devices'],
    sidebarDestination: 'devices',
    stackRoute: 'devices',
    titleKey: 'settings.deviceConnections.title',
  },
  more: {
    exactRootPathnames: ['/more'],
    href: '/more',
    pathPrefixes: ['/more'],
    sidebarDestination: 'more',
    stackRoute: 'more',
    titleKey: 'common.more',
  },
  settings: {
    exactRootPathnames: [],
    href: '/settings',
    pathPrefixes: ['/settings'],
    sidebarDestination: 'settings',
    stackRoute: 'settings',
    titleKey: 'navigation.settings',
  },
} as const satisfies Record<NavDestinationId, NavRouteSpec>;

export const NAV_DESTINATION_IDS = Object.keys(NAV_ROUTE_MANIFEST) as readonly NavDestinationId[];

export function getNavHref(id: NavDestinationId): string {
  return NAV_ROUTE_MANIFEST[id].href;
}

export function getNavTitleKey(id: NavDestinationId): string {
  return NAV_ROUTE_MANIFEST[id].titleKey;
}

export function getNavStackRoute(id: NavDestinationId): string {
  return NAV_ROUTE_MANIFEST[id].stackRoute;
}
