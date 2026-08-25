# Splash Screen And Startup Readiness

> Updated: 2026-08-16
>
> Runtime baseline: Expo `57.0.6`, `expo-splash-screen` `57.0.4`, iOS 17.0+, Android API 26+

## Current Contract

Cherry uses two visually matching surfaces during every process cold start:

| Surface | Owner | Appearance | Exit condition |
| --- | --- | --- | --- |
| Native launch screen | `expo-splash-screen` config plugin | System Light/Dark | The React Native cover has completed layout and crossed two composited frames |
| React Native startup cover | App shell `StartupCoordinator` | Appearance frozen from the system at process start | Bootstrap and initial content are ready, and 800 ms has elapsed since the cover visibly replaced the native surface |

The native and React Native surfaces use the same transparent
`assets/cherry-studio-splash-logo.png` at 96 dp on `#FFFFFF` in Light appearance and `#000000`
in Dark appearance. The logo remains `#FF5757` in both modes. The native surface contains no
attribution or animation.

The React Native cover adds a two-line `from` / `Cherry Studio` attribution 48 dp above the bottom
safe area. The centered logo stays fixed across the native-to-React handoff, while the attribution
fades in over 260 ms after the React Native cover is confirmed visible. After the application
renders behind the opaque cover, the entire cover fades out over 220 ms. The application tree
itself is never animated.

This lifecycle is process-owned state. Background-to-foreground transitions do not remount or reset
the coordinator, so they do not replay the launch experience.

## Startup Sequence

1. The operating system displays the generated native launch screen using the system appearance.
2. The root module calls `SplashScreen.preventAutoHideAsync()` before React renders.
3. `AppBootstrapProvider` starts backend and preference initialization. It owns initialization state
   and post-ready work, but no longer hides the native launch screen.
4. `StartupCoordinator`, inside the bootstrap provider and outside `AppBootstrapGate`, renders an
   opaque cover without reading Uniwind or the saved application theme.
5. After layout and two animation frames, the coordinator hides the native launch screen. Its
   matching background, centered logo, and status bar style make this a direct visual handoff; the
   attribution appears as part of the complete React Native startup screen.
6. `hideAsync()` resolves after dispatching native removal, so the coordinator crosses two more
   animation frames before starting the 800 ms minimum and the attribution fade-in. It then
   releases `startupCoverHandoff`,
   allowing theme and i18n initialization behind the opaque cover. This ordering prevents
   `Uniwind.setTheme()` from recoloring the still-visible iOS LaunchScreen when the system and saved
   application themes differ.
7. When bootstrap is ready, `AppBootstrapGate` mounts the complete navigation tree behind the cover.
   The application uses the restored local theme even when it differs from the frozen system launch
   appearance.
8. The active route reports initial content readiness. The cover exits only after bootstrap,
   content readiness, and the 800 ms minimum are all satisfied.
9. The cover continues to intercept touch and hides the application tree from accessibility until
   its 220 ms UI-thread fade completes. It is then removed from the tree.

If content does not report readiness within three seconds after bootstrap becomes ready, the
coordinator records a warning and treats content as ready. The layout and minimum-duration guards
still apply, so this fallback cannot hide the cover before React has replaced the native surface.

## Initial Content Signal

`StartupRouteReadyReporter` waits for the active navigation root to lay out, then waits two animation
frames before reporting content ready. Route data such as Agents, Sessions, transcript history, and
providers loads independently and cannot extend the startup gate. The three-second coordinator
timeout remains a fallback for navigation trees that never report layout.

## Motion And Accessibility

The cover and attribution opacity transitions use Reanimated timing on the UI thread. When the
operating system's Reduce Motion setting is enabled, the attribution appears without animation and
the cover is removed immediately after readiness and the 800 ms minimum.

While visible, the cover owns pointer input. The underlying application uses
`no-hide-descendants`/`accessibilityElementsHidden`, preventing focus from reaching controls that
are not yet visible. The attribution and logo are decorative and do not become accessibility focus
targets.

## Native Boundary

The generated launch screen is intentionally static. iOS launch storyboards cannot execute React,
Skia, Reanimated, Lottie, video, or application code. Android has a native animated-icon API, but
Expo's shared splash configuration accepts a bitmap and an Android-only implementation would not
match iOS. `LogoDrawAnimation` therefore remains onboarding-owned and is not part of process
startup.

Changing the native image, image width, or launch background requires rebuilding the binary. Expo
Go is not representative, and development builds may not reproduce every splash property. Validate
the native-to-React handoff in preview or production builds on both platforms.[^expo-api]
[^expo-guide]

## Primary Sources

[^expo-api]: Expo, [SplashScreen, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).
[^expo-guide]: Expo, [Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

- Apple, [Specifying your app's launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
- Android Developers, [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen)
- Expo examples, [`with-splash-screen`](https://github.com/expo/examples/tree/master/with-splash-screen)

## Implementation References

- [`app.json`](../../app.json)
- [`src/app/_layout.tsx`](../../src/app/_layout.tsx)
- [`src/frontend/components/startup`](../../src/frontend/components/startup)
- [`src/frontend/features/chat/ChatScreen.tsx`](../../src/frontend/features/chat/ChatScreen.tsx)
- [`src/bootstrap/runtime/AppBootstrapProvider.tsx`](../../src/bootstrap/runtime/AppBootstrapProvider.tsx)
- [`src/bootstrap/runtime/startupCoverHandoff.ts`](../../src/bootstrap/runtime/startupCoverHandoff.ts)
- [`src/frontend/features/onboarding/logoDraw`](../../src/frontend/features/onboarding/logoDraw)
