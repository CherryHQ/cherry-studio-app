# Expo UI Bottom Sheet Navigation and Stacking

> Researched: 2026-08-08
>
> Repository baseline: Expo `57.0.6`, `@expo/ui` `57.0.6`

## Conclusion

| Requirement | Result | Boundary |
| --- | --- | --- |
| Open one sheet and navigate through multiple page depths | **Supported by composition** | `BottomSheet` accepts arbitrary `children`, but it does not provide page history. The feature owns its stack. |
| Animate consistently between sheet pages | **Not part of the shared shell** | Cherry's reduced `BottomSheet` swaps feature-owned content directly and only standardizes the nested-page back action. |
| Present a second physical sheet above an existing sheet | **Supported on iOS when nested** | Expo's current docs require the second `BottomSheet` to be nested inside the first sheet's content, not rendered beside it. |
| Use a managed `stackBehavior`-style sheet stack | **Not supported by Expo UI** | There is no stack coordinator, `stackBehavior`, or `useBottomSheetModal` equivalent. The compatibility provider is a no-op. |

For drill-in interaction, prefer **one physical sheet with feature-owned page state**. It gives consistent back behavior and animation across platforms without introducing two modal lifecycles.

## Why One-Sheet Navigation Works

The universal `BottomSheetProps` surface contains presentation, dismissal, snap-point, and `children` props; it contains no route, path, push, pop, or transition API. The native adapters forward those children into SwiftUI's sheet or Material 3's `ModalBottomSheet`.[^universal-docs] [^universal-types] [^universal-ios] [^universal-android]

This means a two-level flow is an ordinary content composition:

1. Keep a page value or a small page stack in React state.
2. On row press, move from page 0 to page 1.
3. On back, move to the previous page without dismissing the sheet.
4. Keep the sheet mounted and presented during both transitions.

For horizontal animation in SDK 57, there are three first-party Expo UI options:

- `@expo/ui/community/pager-view` is the closest cross-platform fit. It exposes `setPage()` for animated programmatic movement and `setPageWithoutAnimation()` for an immediate jump. Set `scrollEnabled={false}` when the UI should behave like push navigation rather than a user-swipable carousel.[^pager-view]
- Android's `@expo/ui/jetpack-compose` `HorizontalPager` exposes `animateScrollToPage()` and `scrollToPage()`.[^horizontal-pager]
- iOS's `@expo/ui/swift-ui` `TabView` supports page style, controlled selection, and an animation modifier for selection changes.[^tab-view]

The platform-specific sheets also document `RNHostView`, so a React Native Animated or Reanimated content navigator can be hosted inside the native sheet when a shared implementation is preferable.[^android-sheet]

## What "Stacked Sheets" Means

Two different behaviors need separate names:

### Nested physical sheets

Expo's current SwiftUI BottomSheet documentation says that on iOS, a second sheet can appear on top of the first only when the second `BottomSheet` is nested inside the first sheet's content tree. Sibling sheets do not establish the required presentation hierarchy.[^swift-sheet-docs] [^swift-sheet-docs-source]

This is a real stacked presentation, but it is an explicitly nested modal hierarchy. The app must own each sheet's visibility and dismissal order. Expo does not document this as a matching Android/web stack contract, so cross-platform use requires device-level validation.

### Managed sheet stack

Expo UI does not implement gorhom-style modal stack management. The drop-in replacement documents that `BottomSheetModalProvider` only renders its children, and that `useBottomSheetModal` is not supported.[^drop-in-docs] Its source confirms the provider is a fragment with no registry or stack coordinator.[^drop-in-source]

Consequently, there is no supported Expo UI equivalent of a provider that coordinates push, switch, or replace semantics across multiple sheet instances. Multiple controlled sheets can be composed, but their ordering and lifecycle are application concerns rather than a library contract.

## Platform and Version Constraints

- The repository pins `expo` and `@expo/ui` to `57.0.6`. The app targets iOS 17.0+ and Android API 26+.
- Universal `BottomSheet` supports Android, iOS, web, and Expo Go in SDK 57.[^universal-docs]
- Android Material 3 sheets have only `Hidden`, `PartiallyExpanded`, and `Expanded` states. Expo therefore maps arbitrary Android snap points to partial/full behavior rather than exact heights.[^android-sheet-values]
- Expo UI `PagerView` supports Android and iOS, not web. iOS 17 provides snapping; its per-frame page callbacks require iOS 18+. Animated `setPage()` on iOS requires `react-native-worklets`; this repository already pins `react-native-worklets` `0.10.2`.[^pager-view]
- A pager needs a finite height. For a drill-in sheet, use a stable sheet/pager height or deliberate detents so different page content heights do not resize the sheet during the horizontal transition.[^horizontal-pager]

## Repository Fit

The application does not use Expo UI for its shared sheet frame. Its root installs
`BottomSheetProvider` from `@swmansion/react-native-bottom-sheet`, and the package-owned
`@cherrystudio/ui/components` `BottomSheet` wraps that library's `ModalBottomSheet`.[^root-layout]
[^package-sheet]

The shared component exposes controlled visibility, dismissal, title, children, an optional
non-dismissible mode, and an optional nested-page `backAction`. It deliberately does not expose
detents, geometry, close reasons, page-transition primitives, or types from the underlying library.
Features keep their page state and replace content directly inside the same physical sheet.

Use a nested second physical sheet only when the second level must have an independent detent, scrim, drag gesture, or dismissal lifecycle. Do not choose it merely to obtain a left/right content transition.

## Primary Sources

[^universal-docs]: Expo, [Universal BottomSheet, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/universal/bottomsheet/).
[^universal-types]: Expo source, [`BottomSheetProps`](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/src/universal/BottomSheet/types.ts).
[^universal-ios]: Expo source, [universal BottomSheet iOS adapter](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/src/universal/BottomSheet/index.ios.tsx).
[^universal-android]: Expo source, [universal BottomSheet Android adapter](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/src/universal/BottomSheet/index.android.tsx).
[^pager-view]: Expo, [PagerView drop-in replacement, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/pagerview/).
[^horizontal-pager]: Expo, [Jetpack Compose HorizontalPager, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/horizontalpager/); Android, [Pager in Compose](https://developer.android.com/develop/ui/compose/layouts/pager).
[^tab-view]: Expo, [SwiftUI TabView, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/tabview/); Apple, [SwiftUI TabView](https://developer.apple.com/documentation/swiftui/tabview).
[^android-sheet]: Expo, [Jetpack Compose ModalBottomSheet, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/bottomsheet/).
[^swift-sheet-docs]: Expo, [SwiftUI BottomSheet](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/bottomsheet/).
[^swift-sheet-docs-source]: Expo docs source, [`bottomsheet.mdx`](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/ui/swift-ui/bottomsheet.mdx).
[^drop-in-docs]: Expo, [BottomSheet drop-in replacement](https://docs.expo.dev/versions/latest/sdk/ui/drop-in-replacements/bottomsheet/).
[^drop-in-source]: Expo source, [community BottomSheet exports and no-op provider](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/src/community/bottom-sheet/index.tsx).
[^android-sheet-values]: Android, [`SheetValue`](https://developer.android.com/reference/kotlin/androidx/compose/material3/SheetValue) and [Compose bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets).
[^root-layout]: Repository source, [`src/app/_layout.tsx`](../../src/app/_layout.tsx).
[^package-sheet]: Repository source, [`packages/ui/src/components/bottom-sheet/bottom-sheet.tsx`](../../packages/ui/src/components/bottom-sheet/bottom-sheet.tsx).
