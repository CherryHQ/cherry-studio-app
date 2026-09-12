export type SidebarFadeProps = {
  /** Which edge the fade is anchored to: content dissolves as it approaches it. */
  edge: 'bottom' | 'top';
  /** Depth of the fade in points. */
  size: number;
};
