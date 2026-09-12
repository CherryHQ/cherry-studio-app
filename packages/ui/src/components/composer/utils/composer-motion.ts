// The composer's pairings of the package's curves and durations, in one place
// for the same reason its geometry is: two surfaces moving at once at different
// speeds reads as broken rather than as customisable, and that is only
// enforceable if they share a definition.

import { duration, easing } from '../../../motion';

// Anything that changes the composer's size.
export const settleMotion = { duration: duration.base, easing: easing.settle } as const;
