# Fold Region

Reports where a foldable display divides the window, discovered by Expo under `modules/`. Requires
a new native build; clients without the module export `null` and the shell treats the window as
unfolded.

`FoldRegionObserver` is an invisible view. It reads iOS 27.1's division reserved region
(`reservedRegions(kind: .division, options: .includeInactive)`) and reports it in window points
through `onFoldChange`:

- `{ x, y, width, height, isActive }` while the window spans a fold. `isActive` is true only while
  the device is partly folded; a flat device reports its fold line inactive, about zero wide.
- `null` when there is no fold, such as on a closed iPhone Duo's outer display or a regular phone.

UIKit posts no notification when reserved regions change, so the view re-reads them after each
layout pass, when it joins a window, and from a `UIHingeInteraction` update. It reports only
changes. The 27.1 calls sit in Objective-C behind a compile-time SDK check: a build made with an
older SDK compiles and reports no fold.

Android is not wired yet. Jetpack WindowManager's separating `FoldingFeature` maps onto the same
shape when Android foldables need it.
