# Bottom Sheet

`BottomSheet` is Cherry Studio's only exported sheet. The root owns open state; its compound
components explicitly compose the native modal card, fixed chrome, scrolling viewport, and footer.

```tsx
<BottomSheet open={isOpen} onOpenChange={setIsOpen}>
  <BottomSheet.Trigger>Open</BottomSheet.Trigger>
  <BottomSheet.Content height={520} onClose={handleClose}>
    <BottomSheet.Header>
      <BottomSheet.CloseButton accessibilityLabel="Close" />
      <BottomSheet.Title>Settings</BottomSheet.Title>
      <BottomSheet.HeaderSpacer />
    </BottomSheet.Header>
    <BottomSheet.SearchField {...searchProps} />
    <BottomSheet.Body>{virtualizedList}</BottomSheet.Body>
    <BottomSheet.Footer>{actions}</BottomSheet.Footer>
  </BottomSheet.Content>
</BottomSheet>
```

`Trigger` is optional. Use `defaultOpen` when a sheet is mounted only while open, or `open` and
`onOpenChange` when feature state controls it. `Content` owns detents, card geometry, native close
gestures, and the close-settle callback.

`Body` provides a viewport but does not scroll. This lets `LegendList` and other virtualized
controls own scrolling directly. Use `BottomSheet.ScrollView` instead for ordinary scrolling
content. `Header`, `SearchField`, and `Footer` stay pinned as siblings of that viewport.

Give `Content` a `height` and the viewport is bounded: it takes whatever the pinned chrome leaves,
so a virtualized list or a `ScrollView` inside it scrolls. Omit `height` and the card measures to
its content instead, so the viewport does too and nothing inside it scrolls — pick the mode from
whether the content has a natural end. Content-sized cards reach the bottom of the screen, so
whatever sits last in them owns its own home-indicator clearance; read it off
`useBottomSheet().geometry`.

`BottomSheet.Selection` is the explicit single-choice variant. It commits its selection only after
the close animation settles. Callers pass translated labels; CherryUI owns no product language.

Body descendants can call `useBottomSheet()` to request a close with a reason or read card geometry.

## Page Transitions

`BottomSheet.PageTransition` gives every in-sheet navigation depth the same motion without owning
business navigation state:

```tsx
<BottomSheet.PageTransition depth={stack.length - 1} pageKey={currentPage.key}>
  {currentPage.content}
</BottomSheet.PageTransition>
```

- Increasing `depth` pushes from the right.
- Decreasing `depth` pops from the left.
- Changing `pageKey` at the same depth performs a stationary replacement.
- The previous page remains mounted only until its exit completes and is immediately removed from
  pointer and accessibility interaction.
- Reduce Motion switches pages immediately.

The transition viewport needs a bounded height, normally supplied by `BottomSheet.Content`.
