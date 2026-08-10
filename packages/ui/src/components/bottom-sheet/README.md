# Bottom Sheet

`BottomSheet` is Cherry Studio's shared floating-card sheet, built on
`@swmansion/react-native-bottom-sheet`. It owns the sheet silhouette, scrim,
safe-area geometry, close lifecycle, and primary/nested-page header controls.

```tsx
import { BottomSheet } from '@cherrystudio/ui/components';

<BottomSheet isOpen={isOpen} onClose={handleClose} title="Settings">
  {content}
</BottomSheet>;
```

Body descendants can call `useBottomSheet()` to request a close after an action
or read the card geometry. `onClose(reason)` fires once after the closing
animation settles.

## Page Transitions

`BottomSheet.PageTransition` gives every in-sheet navigation depth the same
motion without owning business navigation state:

```tsx
<BottomSheet.PageTransition depth={stack.length - 1} pageKey={currentPage.key}>
  {currentPage.content}
</BottomSheet.PageTransition>
```

- Increasing `depth` pushes from the right.
- Decreasing `depth` pops from the left.
- Changing `pageKey` at the same depth performs a stationary replacement.
- The previous page remains mounted only until its exit completes and is
  immediately removed from pointer and accessibility interaction.
- Reduce Motion switches pages immediately.

The transition viewport needs a bounded height. Use it inside a fixed-height
sheet or give the viewport an explicit height through `style`.
