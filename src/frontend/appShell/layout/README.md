# Page Layout

The app shell owns screen-level width constraints and horizontal safe areas. `FormContentFrame`
limits forms and management pages to 720 logical points; `ReadingContentFrame` limits conversations
and their composers to 800. Both fill smaller parent regions and retain the same component tree
while the window changes size. Existing headers, scroll views, and composers keep top, bottom, and
keyboard inset ownership.

`useIsFormContentConstrained` shares the form-width threshold with navigation and search adapters.
It compares the current window width, minus horizontal safe areas, with the same 720-point limit.
On wider iOS windows, search lives inside the content column and the Agent list uses an opaque
header so the native stack reserves space above that row.

Frames may serve as a native Stack's `screenLayout`, or wrap a page's content below its header.
They do not choose routes, create device-specific page trees, or reset page state. Galleries and
full-screen media own their available region rather than using a reading-width constraint.

`useWindowClass` resolves the window to `compact`, `medium`, or `expanded`. It subtracts the left
and right safe areas independently and divides by the rendered text scale, so larger text reaches a
narrower class sooner. The thresholds come from the narrowest readable regions in `windowClass.ts`:
a 360-point file pane beside a 440-point conversation needs 800 points, and a 280-point sidebar
beside both needs 1080. Layout owners read the class; pages and components never branch on device
names. `useIsSidebarPersistent` is the shell's single rule for keeping the sidebar beside chat.
`resolveFilePaneWidth` gives a pane 43% of the content width, kept between 360 and 520 points.

On a foldable, `FoldRegionProvider` shares the fold reported by
[`fold-region`](../../../../modules/fold-region/README.md) through `useFoldRegion`, and
`resolvePaneSplit` lets a fold inside the host decide where a pane meets the chat. A fold running
down the window places the pane on its leading side while the device is partly folded; flat, the
regular widths apply. A fold running across the window stacks the pane above the chat whether or not
the device is folded. The fold itself stays empty, and a fold at the host's edge is ignored.

`useFoldRegionLayout` exposes the complete native snapshot: host bounds, horizontal safe areas,
window dimensions, and fold. `FilePaneHost` supplies `resolvePaneSplit` with that host and fold,
and calculates the regular pane width from the host width minus its own safe areas. The host is
already beside the persistent sidebar, so its width is not subtracted again. Without the native
module, `onLayout` supplies host dimensions at origin zero and the safe-area context supplies
insets. Neither path uses `measureInWindow`.

`useIsFoldRegionLayoutCurrent` compares the snapshot's window dimensions with the current window.
Until they agree, the pane keeps whatever the last current snapshot showed: it cannot appear using
the previous screen's geometry, a pane already on screen does not uncover the chat, and availability
changes do not carry or return a preview. This freshness check does not interpolate the split.

`PaneChromeProvider` marks a page rendered in a side pane rather than its own native-stack screen.
Headers and bottom toolbars inside it render inline, and the provider supplies the pane's exit as
the header's leading action and, optionally, one pane control placed before the page's trailing
actions.

`ChatDockLayoutProvider` shares the height measured by `ChatDockFooter`, including its top gap,
across the chat and drawer. The sidebar adds this space to the composer's action-center offset so
its floating controls stay aligned when footer text wraps or scales.
