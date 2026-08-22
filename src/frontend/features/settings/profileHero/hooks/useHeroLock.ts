// Platform resolver: Metro picks useHeroLock.ios.ts / .android.ts at bundle
// time; this base module re-exports the Android variant so TypeScript (which
// ignores platform suffixes) has a concrete type. Both variants share the
// HeroLock signature. Mirrors the HeaderChrome.tsx pattern.
export { useHeroLock } from './useHeroLock.android';
export type { HeroLock } from './useHeroLock.types';
