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

`ChatDockLayoutProvider` shares the height measured by `ChatDockFooter`, including its top gap,
across the chat and drawer. The sidebar adds this space to the composer's action-center offset so
its floating controls stay aligned when footer text wraps or scales.
