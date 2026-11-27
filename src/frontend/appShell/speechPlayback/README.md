# Speech Playback Overlay

App-wide floating reading capsule and shared top clearance provider mounted inside the `(drawer)` shell content column.

- **Ownership:** Observes `Backend.voice` activity (`kind === 'speaking'`) via `useSyncExternalStore` and presents preparing, playing, paused, completed-chunk progress, and return-to-conversation controls (`SpeechPlaybackInsetProvider` / `useSpeechPlaybackInset` supply measured clearance so scroll views and lists do not sit beneath the capsule).
- **Placement & Navigation:** Anchored inside the content column below the header row (`insets.top + mainHeaderRowHeight + 6`), keeping wide-window sidebars and navigation rails unobstructed and staying outside root onboarding/login/modal routes. Return navigation reuses `conversationHref` / `useConversationTarget`, dismissing Settings rather than stacking duplicate chat routes.
- **Motion:**
  - Capsule enter/exit animates `opacity`, `translateY` (`-8 -> 0`), and `scale` (`0.96 -> 1`) on the UI thread using `easing.sheet` / `duration.fast`, disabled under live `AccessibilityInfo` Reduce Motion updates.
  - `SpeechWaveform` animates 3 vertical bar transforms (`scaleY`) only while `phase === 'playing'`, `AppState === 'active'`, and Reduce Motion is off. When paused or backgrounded, bars settle statically; under Reduce Motion, static balanced heights represent active playback.
