// The composer's pairings of the package's curves and durations, in one place
// for the same reason its geometry is: two surfaces moving at once at different
// speeds reads as broken rather than as customisable, and that is only
// enforceable if they share a definition.

import { duration, easing } from '../../../motion';

// Anything that changes the composer's size.
export const settleMotion = { duration: duration.base, easing: easing.settle } as const;

// Opening the menu overshoots and takes longer than closing it. That asymmetry
// is where the menu's feel lives — matching the durations would make it read as
// a plain toggle. Rows that swell the composer itself deliberately do not do
// this: overshooting their height would bounce the field and the toolbar along
// with them.
export const menuOpenMotion = { duration: duration.slow, easing: easing.overshoot } as const;

// The menu's cross-fade is deliberately shorter than its shape change, so the
// panel is already legible while the container is still settling. A collapsing
// row is the opposite case and keeps its fade in lockstep with its height: fade
// it out early and the last thing on screen is an empty box shrinking.
export const menuFadeMotion = { duration: duration.fast, easing: easing.settle } as const;
