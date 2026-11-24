# Page Layout

The app shell owns screen-level width constraints and horizontal safe areas. `FormContentFrame`
limits forms and management pages and `ReadingContentFrame` limits conversations and their
composers, both to 720 logical points. Both fill smaller parent regions and retain the same component tree
while the window changes size. Existing headers, scroll views, and composers keep top, bottom, and
keyboard inset ownership.

`useIsFormContentConstrained` shares the form-width threshold with navigation and search adapters.
It compares the current window width, minus horizontal safe areas, with the same 720-point limit.
On wider iOS windows, search lives inside the content column and the Agent list uses an opaque
header so the native stack reserves space above that row.

Frames may serve as a native Stack's `screenLayout`, or wrap a page's content below its header.
They do not choose routes, create device-specific page trees, or reset page state. Galleries and
full-screen media own their available region rather than using a reading-width constraint.

`useWindowClass` resolves the window to `compact` or `wide`. It subtracts the left and right safe
areas independently and divides by the rendered text scale, so larger text reaches the compact class
sooner. The threshold comes from the readable region widths in `windowClass.ts`: a 360-point
secondary column beside a 440-point conversation needs 800 points. The sidebar is 280 points wide;
its search column uses `resolveFilePaneWidth` to take 43% of the available width, kept between
360 and 520 points. Layout owners read the class; pages and components never branch on
device names. `useCanDockSidebar` is the shell's single rule for whether the sidebar can stand beside
the content region; the [sidebar](../sidebar/README.md) decides whether it is showing.
The navigation shell owns its rail modes and Files list width. The
[Files Master-Detail host](../pane/README.md) lays out the library and preview in `wide-rail` mode.

On a foldable, `FoldRegionProvider` shares the fold that
[`react-native-reserved-regions`](https://github.com/appandflow/react-native-reserved-regions)
reports for the host through `useFoldRegion`. The Files Master-Detail host uses a vertical fold
to size its master column. The library reports a division only while the device is
partly folded, from UIKit's reserved regions on iOS 27.1 and Jetpack WindowManager's folding
features on Android; flat and regular displays report none, and the regular widths apply.

`WindowFoldRegion` observes the fold across the whole window for layouts that size regions to it,
read through `useWindowFoldRegion`. The sidebar column uses it rather than the split snapshot: that
reporter sees only folds inside its own host, so a column grown to the fold would move the host past
it and lose the fold it was sized to.

Each observer is an invisible regions provider filling its host. `useFoldRegionLayout` exposes its
snapshot: the host size, the window dimensions it was taken in, and the fold in host points.

The observer remounts for every window size, so a resized window reports afresh instead of through
the previous screen's regions. `useIsFoldRegionLayoutCurrent` compares the snapshot's window
dimensions with the current window. `useWindowFoldRegion` returns no fold until those dimensions
agree, keeping the sidebar from sizing its column with the previous window's geometry.

`PaneChromeProvider` marks a page rendered in a side pane rather than its own native-stack screen.
Headers and bottom toolbars inside it render inline. The provider can supply a leading action,
one pane control before the page's trailing actions, and the inline title alignment. The Files
Master-Detail host uses it for both the library list and preview columns.

`ChatDockLayoutProvider` shares the height measured by `ChatDockFooter`, including its top gap,
across the chat and drawer. The sidebar adds this space to the composer's action-center offset so
its floating controls stay aligned when footer text wraps or scales. It also shares the chat's native header height,
published by the iOS chat header, so the sidebar's title row can sit level with the header's
controls where the header does not start below the top safe area, as on an iPhone Duo's inner
display.
