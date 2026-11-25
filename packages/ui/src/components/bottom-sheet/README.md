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
separate the sheet from the page. The full-height card container renders this card background across
every detent, and the header, body, and fixed footer share this fill
(`@swmansion/react-native-bottom-sheet@0.15.3`'s native `surface` prop is omitted because its iOS
`BottomSheetSurfaceComponentView` lacks `_props` initialization).

The card fills the horizontal safe area up to 720 logical points and remains centered on wider
windows. Its native host and scrim still span the window; the transparent space beside the card
dismisses through the same guarded close action. Geometry updates do not replace the sheet or its
content. Picker content measures its own available region instead of using the window width.

```tsx
<BottomSheet onClose={close} open={isOpen} size="large" title="Models">
  <ModelList />
</BottomSheet>
```

The API is intentionally small: `open`, `onClose`, `children`, optional `title`, `bodyInset`
(`'safe-area'` by default, or `'none'` when a scrollable child applies bottom safe-area padding to
its own scroll content instead of clipping at the bottom inset), exactly one of `size`, `height`,
or a non-empty `sizes` list; optional `testID`, optional `dismissible`, and an optional
`headerAction` for one compact control beside the title. The title is a heading truncated after two lines;
omitting the title and header actions removes the title row, leaving a 22-point handle region
for preview-led panels (or a 44-point drag zone on headerless multi-detent sheets). When the title is a question or request the user must read in full, pass `titleVariant="prompt"` for a
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

For multiple heights (`sizes`), scrollable gesture negotiation is disabled
(`disableScrollableNegotiation`) so nested lists and fast scrollers scroll freely at every detent,
while dragging the top non-scrollable region resizes or dismisses the sheet. The full-height card
container renders the card background across the sheet, and the body adopts taller detent heights on
commit and smaller heights on settlement to avoid per-frame layout passes; when a `footer` is
present, the native position event translates it on the UI thread via `translateY`. Keyboard
avoidance keeps its separate keyboard-driven layout on single-height sheets, and any downward
resize or dismissal on a keyboard-avoiding sheet dismisses the keyboard immediately on commit.

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

Pass `onBack` to handle system Back, web Escape, and accessibility escape without adding a header
button. It takes precedence over the default system dismissal and `backAction`, including when
`dismissible={false}`. Drag and scrim dismissal still follow `dismissible`.

Set `avoidKeyboard` when the sheet holds a text field. The card then rises with the keyboard frame
by frame and keeps its footer a small gap above it; once the card reaches the top inset, its body
shrinks instead, so keep the field outside the scrolling body to keep it visible. Such a sheet has
one height when using `size` or `height` alone: it follows its own animated height rather than
switching detents. With multiple `sizes`, native snap points stay fixed and keyboard space shrinks
the body instead. Dismissing the keyboard does not change the selected size. Dragging to a smaller
open size dismisses the keyboard.

```tsx
const [size, setSize] = useState<BottomSheetSize>('medium');

<BottomSheet
  avoidKeyboard
  bodyInset="none"
  onClose={close}
  onSizeChange={setSize}
  open={isOpen}
  size={size}
  sizes={['medium', 'full']}
  title="Models"
>
  <SearchField onFocus={() => setSize('full')} {...searchProps} />
  <ModelList />
</BottomSheet>
```

Set `dismissible={false}` when a workflow must remain visible until it reaches an explicit outcome.
The closed detent then becomes programmatic-only: drag, scrim, and default system dismissal cannot
reach it, while changing `open` to `false` still performs the controlled close. An explicit `onBack`
or `backAction` can handle system Back separately. Such a sheet hides its drag handle unless
`sizes` still lets the user drag between heights; the handle's
space stays so the header does not move.

## Covering overlays

Use `presentation="overlay"` for a handle-only surface. `title` remains its accessible name; the
visible heading and header actions are omitted. Nested sheets inherit this presentation and a
minimum height equal to their parent, keeping the lower card covered. The parent stays mounted and
becomes inactive while a nested sheet is presented. Sibling sheets coordinate the same behavior
with `active={false}` on the covered sheet and `size="full"` on the child.

`size="content"` wraps short content in a scroll view and measures the body, handle/header, footer
and safe-area space, capped at the available height. Fixed and semantic sizes remain available.
`initialFocusRef` selects the first focus target; `returnFocusRef` restores focus after dismissal.
`onClose` reports an interactive dismissal once it settles. `onClosed` also runs for controlled
closures, after focus restoration, so a caller can wait before opening a native picker or focusing
its input. An overlay allocates its native portal on first opening and then keeps its content
mounted during controlled hiding, preserving scroll state across file previews.
