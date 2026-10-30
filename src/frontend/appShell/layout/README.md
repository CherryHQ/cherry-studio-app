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
sooner. The threshold comes from the narrowest readable regions in `windowClass.ts`: a 360-point file
pane beside a 440-point conversation needs 800 points. A wide window keeps one left column (the
280-point sidebar, the file pane, or search) beside one content region, so fitting the widest left
column also fits the sidebar. Layout owners read the class; pages and components never branch on
device names. `useCanDockSidebar` is the shell's single rule for whether the sidebar can stand beside
the content region; the [sidebar](../sidebar/README.md) decides whether it is showing.
`resolveFilePaneWidth` gives a pane 43% of the content width, kept between 360 and 520 points.

On a foldable, `FoldRegionProvider` shares the fold that
[`react-native-reserved-regions`](https://github.com/appandflow/react-native-reserved-regions)
reports for the split host through `useFoldRegion`, and `resolvePaneSplit` lets a fold inside the
host decide where a pane meets the chat. The library reports a division only while the device is
partly folded, from UIKit's reserved regions on iOS 27.1 and Jetpack WindowManager's folding
features on Android; flat and regular displays report none, and the regular widths apply. A fold
running down the window places the pane on its leading side; one running across it stacks the pane
above the chat. The fold itself stays empty, and a fold at the host's edge is ignored.

`WindowFoldRegion` observes the fold across the whole window for layouts that size regions to it,
read through `useWindowFoldRegion`. The sidebar column uses it rather than the split snapshot: that
reporter sees only folds inside its own host, so a column grown to the fold would move the host past
it and lose the fold it was sized to.

Each observer is an invisible regions provider filling its host. `useFoldRegionLayout` exposes its
snapshot: the host size, the window dimensions it was taken in, and the fold in host points.
`FilePaneHost` starts at the window's top edge, so its offsets are also window coordinates. It
supplies `resolvePaneSplit` with that host and fold, and calculates the regular pane width from the
host width minus the window's horizontal safe areas. The host is already beside the persistent
sidebar, so its width is not subtracted again. Nothing uses `measureInWindow`.

The observer remounts for every window size, so a resized window reports afresh instead of through
the previous screen's regions. `useIsFoldRegionLayoutCurrent` compares the snapshot's window
dimensions with the current window. Until they agree, the pane keeps whatever the last current
snapshot showed but reserves no space: it cannot appear using the previous screen's geometry, a pane
already on screen does not uncover the chat, the previous split cannot squeeze the chat in the new
window, and availability changes do not carry or return a preview. This freshness check does not
interpolate the split.

`PaneChromeProvider` marks a page rendered in a side pane rather than its own native-stack screen.
Headers and bottom toolbars inside it render inline, and the provider supplies the pane's exit as
the header's leading action and, optionally, one pane control placed before the page's trailing
actions.

`ChatDockLayoutProvider` shares the height measured by `ChatDockFooter`, including its top gap,
across the chat and drawer. The sidebar adds this space to the composer's action-center offset so
its floating controls stay aligned when footer text wraps or scales. It also shares the chat's native header height,
published by the iOS chat header, so the sidebar's title row can sit level with the header's
controls where the header does not start below the top safe area, as on an iPhone Duo's inner
display.
