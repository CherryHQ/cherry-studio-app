import { duration, easing } from '../../motion';

// The composer add menu and context menus share one expanding-panel motion.
// Opening has a small overshoot; closing settles sooner. Reversing either
// transition starts from its current progress, and reduced motion skips both.
export const menuOpenMotion = { duration: duration.slow, easing: easing.overshoot } as const;
export const menuCloseMotion = { duration: duration.base, easing: easing.settle } as const;
export const menuFadeMotion = { duration: duration.fast, easing: easing.settle } as const;
export const menuSlideDistance = 40;
export const menuRestingScale = 0.97;
export const menuBlurRadius = 2;
