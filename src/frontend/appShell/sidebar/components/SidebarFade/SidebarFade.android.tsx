import type { SidebarFadeProps } from './SidebarFade.types';

/**
 * No-op. Android has no cheap progressive blur — `expo-blur`'s experimental
 * method costs a full-frame readback per frame, which a drawer that moves under
 * the finger cannot pay — so it gets `ScrollShadow`'s color dissolve alone.
 */
export function SidebarFade(_props: SidebarFadeProps) {
  return null;
}
