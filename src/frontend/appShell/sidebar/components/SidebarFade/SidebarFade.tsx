// Platform resolver: Metro picks SidebarFade.ios.tsx / .android.tsx at bundle
// time; this base module re-exports the Android variant so TypeScript (which
// ignores platform suffixes) has a concrete type.
export { SidebarFade } from './SidebarFade.android';
export type { SidebarFadeProps } from './SidebarFade.types';
