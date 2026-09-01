# Bottom Sheet

`BottomSheet` is Cherry Studio's only mobile sheet shell. It uses the same regulated card heights,
four-point side and bottom insets, display-concentric bottom corners, drag handle, scrim, safe-area
handling, gestures, Android back behavior, and accessibility behavior on iOS and Android.

```tsx
<BottomSheet onClose={close} open={isOpen} size="large" title="Models">
  <ModelList />
</BottomSheet>
```

The API is intentionally small: `open`, `onClose`, `title`, `children`, exactly one of `size`,
`height`, or a non-empty `sizes` list; optional `testID`, optional `dismissible`, and an optional
`headerAction` for one compact control beside the title. An optional `footer` stays fixed below the
flexible body and owns its divider, horizontal action inset, and bottom safe-area spacing; callers
provide only the footer control. `size` accepts `compact`, `medium`, or `large`, resolving to 40%,
60%, or 80% of the available screen height, plus `full` for all available height below the top safe
area. `sizes` exposes multiple semantic heights in ascending order and opens at the smallest one, so
users can drag upward for a larger preview. `height` accepts a fixed React Native logical-pixel value
and is clamped to the available screen height. Product components choose semantic tokens, or use a
fixed height, but do not receive detents, geometry, close reasons, or types from the underlying UI
library.

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

Root sheets intentionally have no close button. Users dismiss them with a downward gesture, the
scrim, Android back, or the accessibility escape action.

Set `dismissible={false}` when a workflow must remain visible until it reaches an explicit outcome.
The closed detent then becomes programmatic-only: drag, scrim, Android back, and accessibility
escape cannot reach it, while changing `open` to `false` still performs the controlled close.
