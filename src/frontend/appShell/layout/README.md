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
