import { duration, easing } from '../../motion';

export const toastEnterMotion = { duration: duration.slow, easing: easing.overshoot } as const;
export const toastExitMotion = { duration: duration.base, easing: easing.settle } as const;
export const toastFadeMotion = { duration: duration.fast, easing: easing.settle } as const;
export const toastMorphMotion = { duration: duration.base, easing: easing.settle } as const;
export const toastPressMotion = { duration: duration.fast, easing: easing.settle } as const;
