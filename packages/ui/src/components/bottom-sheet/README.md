# Bottom Sheet

`BottomSheet` is Cherry Studio's only mobile sheet shell. It uses the same regulated card heights,
full-width bottom-anchored surface, top-only corners, drag handle, scrim, safe-area handling,
gestures, Android back behavior, and accessibility behavior on iOS and Android.

```tsx
<BottomSheet onClose={close} open={isOpen} size="large" title="Models">
  <ModelList />
</BottomSheet>
```

The API is intentionally small: `open`, `onClose`, `title`, `children`, exactly one of `size` or
`height`, optional `testID`, optional `dismissible`, and an optional `headerAction` for one compact
control beside the title. `size` accepts `compact`, `medium`, or `large`, resolving to 40%, 60%, or
80% of the available screen height, plus `full` for all available height below the top safe area.
`height` accepts a fixed React Native logical-pixel value and is clamped to the available screen
height. Product components choose or dynamically switch the semantic token, or use a fixed height,
but do not receive detents, geometry, close reasons, or types from the underlying UI library.

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
