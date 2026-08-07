// Default export for type resolution and non-iOS platforms. Metro resolves
// composerPlatform.ios.tsx on iOS and composerPlatform.android.tsx on Android.
//
// Only the platform-divergent chrome lives behind this seam — the surface
// material (Liquid Glass vs plain) and the text field's vertical insets. The
// composer's layout, state, and the attachment strip's swell/shrink animation
// are identical on both platforms and stay in composer.tsx rather than being
// duplicated into a composer.ios/composer.android pair that would drift.
export { ComposerSurface, composerTextInsets } from './composerPlatform.android';
