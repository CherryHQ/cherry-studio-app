import { usePathname } from 'expo-router';

import { resolveSidebarDestination } from '../sidebarDestination';

/** The sidebar entry whose page fills the content region, if any. */
export function useSidebarDestination() {
  return resolveSidebarDestination(usePathname());
}
