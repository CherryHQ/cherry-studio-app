# Splash Screen And Startup Readiness

> Updated: 2026-11-27
>
> Dependency baseline updated 2026-09-11: Expo `57.0.21`, `expo-splash-screen` `57.0.8`, iOS 17.0+, Android API 26+

## Current Contract

Cherry uses only the OS-owned native launch screen during cold start:

| Surface | Owner | Appearance | Exit condition |
| --- | --- | --- | --- |
| Native launch screen | `expo-splash-screen` config plugin | System Light/Dark | Bootstrap and initial content are ready (or the 3 s content fallback expires) |

The native surface uses the desktop-aligned `assets/icon.png` at 96 dp on `#FFFFFF` in Light
appearance and `#000000` in Dark appearance, with no attribution, JS startup cover, artificial
minimum display hold, or exit animation.

This lifecycle is process-owned state. Background-to-foreground transitions do not remount or reset
`StartupCoordinator`, so they do not re-hold the launch surface.

## Startup Sequence

1. The operating system displays the generated native launch screen using the system appearance.
2. The root module calls `SplashScreen.preventAutoHideAsync()` before React renders.
3. `AppBootstrapProvider` starts backend, preference, i18n, initial Agent, and boot-theme
   initialization (`initializeAppRuntime`) immediately without waiting for any JS cover handoff.
4. `StartupCoordinator` sits outside `AppBootstrapGate`. While the native splash remains visible, it
   blocks pointer input and hides the underlying tree from accessibility.
5. When bootstrap is ready, `AppBootstrapGate` mounts the complete navigation tree using the
   restored local theme and translations.
6. The active route reports initial content readiness. As soon as bootstrap and content readiness are
   both satisfied, `StartupCoordinator` calls `SplashScreen.hideAsync()` immediately with no added
   delay or exit animation.
7. Once `SplashScreen.hideAsync()` resolves, `StartupCoordinator` flips `useStartupCoverVisible` to
   `false`, enabling pointer input, accessibility, and deferred post-launch UI work.

If content does not report readiness within three seconds after bootstrap becomes ready, the
coordinator records a warning (`startup.content.timeout`) and dismisses the native splash anyway.

## Initial Content Signal

`StartupRouteReadyReporter` waits for the active navigation root to lay out, then waits two animation
frames before reporting content ready. Route data such as Agents, Sessions, transcript history, and
providers loads independently and cannot extend the startup gate. The three-second coordinator
timeout remains a fallback for navigation trees that never report layout.

## Post-Launch Handoff

Screens and app-shell providers read `useStartupCoverVisible` from the startup module to tell
whether the native launch screen is still dismissing:

- The onboarding welcome intro waits until `useStartupCoverVisible` is `false` so `LogoDrawAnimation`
  is not spent behind the native splash.
- `AppUpdateProvider` defers its required-version prompt check until the native splash is gone.
- `UuRemoteCallbackBridge` defers opening a cold-start target until the native splash is gone.

## Native Boundary

The generated launch screen is static. iOS launch storyboards cannot execute React, Skia,
Reanimated, Lottie, video, or application code. Android has a native animated-icon API, but Expo's
shared splash configuration accepts a bitmap and an Android-only implementation would not match iOS.
`LogoDrawAnimation` therefore remains onboarding-owned and is not part of process startup.

Changing the native image, image width, or launch background requires rebuilding the binary. Expo Go
is not representative, and development builds may not reproduce every splash property. Validate
splash dismissal in preview or production builds on both platforms.[^expo-api] [^expo-guide]

## Primary Sources

[^expo-api]: Expo, [SplashScreen, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).
[^expo-guide]: Expo, [Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).

- Apple, [Specifying your app's launch screen](https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen)
- Android Developers, [Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen)
- Expo examples, [`with-splash-screen`](https://github.com/expo/examples/tree/master/with-splash-screen)

## Implementation References

- [`app.json`](../../app.json)
- [`src/app/_layout.tsx`](../../src/app/_layout.tsx)
- [`src/frontend/appShell/startup`](../../src/frontend/appShell/startup)
- [`src/frontend/features/chat/ChatScreen.tsx`](../../src/frontend/features/chat/ChatScreen.tsx)
- [`src/bootstrap/runtime/AppBootstrapProvider.tsx`](../../src/bootstrap/runtime/AppBootstrapProvider.tsx)
- [`src/frontend/features/onboarding/components/LogoDraw`](../../src/frontend/features/onboarding/components/LogoDraw)
