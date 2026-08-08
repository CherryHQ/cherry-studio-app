// The composer's curves, in one place for the same reason its geometry is: two
// surfaces moving at once at different speeds reads as broken rather than as
// customisable, and that is only enforceable if they share a definition.

import { Easing } from 'react-native-reanimated';

// Pure deceleration — fast off the mark, then a hard settle. Anything that
// changes the composer's size uses it.
export const settleMotion = {
  duration: 250,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
} as const;

// Opening the menu overshoots (the y=1.25 control point) and takes longer than
// closing it. That asymmetry is where the menu's feel lives — matching the
// durations would make it read as a plain toggle. Rows that swell the composer
// itself deliberately do not do this: overshooting their height would bounce the
// field and the toolbar along with them.
export const menuOpenMotion = {
  duration: 350,
  easing: Easing.bezier(0.34, 1.25, 0.64, 1),
} as const;

// The menu's cross-fade is deliberately shorter than its shape change, so the
// panel is already legible while the container is still settling. A collapsing
// row is the opposite case and keeps its fade in lockstep with its height: fade
// it out early and the last thing on screen is an empty box shrinking.
export const menuFadeMotion = { duration: 200, easing: settleMotion.easing } as const;
