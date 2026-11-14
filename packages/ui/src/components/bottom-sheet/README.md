# Bottom Sheet

`BottomSheet` is Cherry Studio's only mobile sheet shell. It uses the same regulated card heights,
bottom-attached surface, rounded top corners, drag handle, scrim, safe-area
handling, gestures, Android back behavior, and accessibility behavior on iOS and Android.
`BottomSheetProvider` supplies the sheet's portal host. Mount it at the app root; native modal
routes that present sheets also mount a local provider inside their route (as `/share` and
`/drawings/templates` do).
This keeps controls above the modal's touch surface while retaining the page controller that UIKit
menus need for presentation. Sheets stay in the provider's view hierarchy rather than a detached
window overlay.

Dark mode uses an opaque `popover` base with a neutral `secondary` overlay and a fine border to
separate the sheet from the page. The header, body, and fixed footer share this fill.

The card fills the horizontal safe area up to 720 logical points and remains centered on wider
windows. Its native host and scrim still span the window; the transparent space beside the card
dismisses through the same guarded close action. Geometry updates do not replace the sheet or its
content. Picker content measures its own available region instead of using the window width.

```tsx
<BottomSheet onClose={close} open={isOpen} size="large" title="Models">
  <ModelList />
</BottomSheet>
```

The API is intentionally small: `open`, `onClose`, `children`, optional `title`, exactly one of `size`,
`height`, or a non-empty `sizes` list; optional `testID`, optional `dismissible`, and an optional
`headerAction` for one compact control beside the title. The title is a heading truncated after two lines;
omitting the title and header actions removes the title row, leaving a 22-point handle region
for preview-led panels. When the title is a question or request the user must read in full, pass `titleVariant="prompt"` for a
body-sized title that is never truncated. An optional `footer` stays fixed below the
flexible body and owns its divider, horizontal action inset, and bottom safe-area spacing; callers
provide only the footer control. `size` accepts `compact`, `medium`, or `large`, resolving to 40%,
60%, or 80% of the available screen height, plus `full` for all available height below the top safe
area. `sizes` exposes multiple semantic heights in ascending order and opens at the smallest one, so
users can drag upward for a larger preview. Pass `size` alongside `sizes` to control the active
height, and mirror user-driven changes through `onSizeChange`. Programmatic size changes do not
emit that callback. `height` accepts a fixed React Native logical-pixel value
and is clamped to the available screen height. Product components choose semantic tokens, or use a
fixed height, but do not receive detents, geometry, close reasons, or types from the underlying UI
library.

Expandable cards follow the native sheet's visible height on the UI thread, keeping their fixed
footer on screen at every open height. Closing slides out the smallest card without collapsing its
content. Single-height and keyboard-avoiding cards retain their own height rules.

```tsx
<BottomSheet
  footer={<Button onPress={createItem}>Create item</Button>}
  onClose={close}
  open={isOpen}
  size="medium"
  title="Items"
>
  <ItemList />
</BottomSheet>
```

```tsx
<BottomSheet
  onClose={close}
  open={isOpen}
  sizes={['compact', 'large']}
  title="Tool details"
>
  <ToolDetails />
</BottomSheet>
```

For a second level, keep the page state in the feature and pass `backAction` while that level is
visible:

```tsx
<BottomSheet
  backAction={detail ? { accessibilityLabel: "Back", onPress: showRoot } : undefined}
  onClose={close}
  open={isOpen}
  size={detail ? "compact" : "medium"}
  title={detail ? "Theme" : "Settings"}
>
  {detail ? <ThemeOptions /> : <SettingsRows />}
</BottomSheet>
```

Root sheets omit the close button by default. For a picker with an explicit cancel affordance,
pass `closeAction={{ accessibilityLabel: 'Close' }}`. This places an X on the left and centers the
title between equal action columns; `headerAction` stays on the right. The close button uses the
same dismissal path as the downward gesture, scrim, Android back, and accessibility escape action.
When showing a second level, `backAction` takes precedence over `closeAction`.
For a title-only header, omit both actions and pass `titleAlign="center"`. Omitting `titleAlign`
preserves the default: centered with `closeAction`, start-aligned otherwise.
With `backAction` and `titleAlign="center"`, equal action columns keep the title centered in the
card while moving between levels.

Set `avoidKeyboard` when the sheet holds a text field. The card then rises with the keyboard frame
by frame and keeps its footer a small gap above it; once the card reaches the top inset, its body
shrinks instead, so keep the field outside the scrolling body to keep it visible. Such a sheet has
one height when using `size` or `height` alone: it follows its own animated height rather than
switching detents. With multiple `sizes`, native snap points stay fixed and keyboard space shrinks
the body instead. Dismissing the keyboard does not change the selected size. Dragging to a smaller
open size dismisses the keyboard.

```tsx
const [size, setSize] = useState<BottomSheetSize>('large');

<BottomSheet
  avoidKeyboard
  onClose={close}
  onSizeChange={setSize}
  open={isOpen}
  size={size}
  sizes={['large', 'full']}
  title="Models"
>
  <SearchField onFocus={() => setSize('full')} {...searchProps} />
  <ModelList />
</BottomSheet>
```

Set `dismissible={false}` when a workflow must remain visible until it reaches an explicit outcome.
The closed detent then becomes programmatic-only: drag, scrim, Android back, and accessibility
escape cannot reach it, while changing `open` to `false` still performs the controlled close. Such a
sheet hides its drag handle unless `sizes` still lets the user drag between heights; the handle's
space stays so the header does not move.
