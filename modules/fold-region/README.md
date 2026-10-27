# Fold Region

Reports where a foldable display divides the window, discovered by Expo under `modules/`. Requires
a new native build. Clients without the module (Android, older builds) export `null`, checked with
`requireOptionalNativeModule` because `requireNativeView` returns a placeholder there, and the shell
treats the window as unfolded.

`FoldRegionObserver` is an invisible view that fills the layout host. `onLayoutChange` delivers one
`FoldRegionLayout` snapshot:

```ts
{
  host: { x, y, width, height },
  insets: { left, right },
  window: { width, height },
  fold: { x, y, width, height, isActive } | null,
}
```

The host is `convert(bounds, to: nil)`, insets are the view's own horizontal `safeAreaInsets`, and
window dimensions come from `window.bounds`. Host and fold share window coordinates in logical
points. The fold comes from iOS 27.1's division reserved region
(`reservedRegions(kind: .division, options: .includeInactive)`):

- `{ x, y, width, height, isActive }` while the window spans a fold. `isActive` is true only while
  the device is partly folded; a flat device reports its fold line inactive.
- `null` when there is no fold, such as on a closed iPhone Duo's outer display or a regular phone.

UIKit posts no notification when reserved regions change, so the view re-reads them after each
layout pass, when it joins a window, and from a `UIHingeInteraction` update. It compares the complete
snapshot and reports only changes. The 27.1 calls sit in Objective-C behind a compile-time SDK
check: a build made with an older SDK still reports layout geometry with a null fold.

This event replaces `onFoldChange`; clients built with that earlier contract must be rebuilt.
There is no fallback for the old event shape. When the native module is absent, the shell measures
the host with `onLayout` and uses its safe-area context instead.

Android is not wired yet. Jetpack WindowManager's separating `FoldingFeature` maps onto the same
shape when Android foldables need it.
