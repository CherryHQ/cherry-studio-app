# Voice And Background

Speech-to-text dictation in the composer, read-aloud TTS playback and cancellation, system
permission prompts, and background/foreground lifecycle transitions (including iOS Live Activity
and Android background generation).

## User Entry

- Voice settings: Sidebar (`testID:sidebar-settings`) -> `testID:settings-voice`.
- iOS progress display: Settings → Notifications → Enable Dynamic Island.
- In-composer dictation status indicator: `testID:chat-composer-dictation-status` (appears while
  listening or transcribing inside `testID:chat-composer`).
- Desktop pairing paste entry (related background/remote workflow): `testID:desktop-pairing-paste`.

## Verification Driver

- Focused Jest suites:
  - `pnpm test:app -- src/frontend/features/chat/voice/__tests__/DictationStatus.test.ts --runInBand`
- Device acceptance: `agent-device` on a device/simulator with microphone permissions configured;
  if hardware audio capture or external speech service credentials are unavailable on simulator,
  explicitly record the audio capture step as `inconclusive`.

## Observable Acceptance

- While listening, `testID:chat-composer-dictation-status` ticks elapsed recording duration every
  second and transitions cleanly to transcribing state without leaving an active interval after
  unmount.
- Cancelling read-aloud playback stops audio immediately across both local and DeepSeek engines.
- Sending the app to background and foregrounding mid-task preserves active generation state and
  flushes pending drafts cleanly.
- A running chat has one Live Activity. Touch and hold its timer for details. Turning off
  Enable Dynamic Island hides the activity while the task keeps its execution lease.
  [Simulator screenshots of the compact, expanded, and hidden states](../../.github/images/background-activity/ios-dynamic-island.png).

## Known Pitfalls

- Native system permission alerts must be serialized through `devicePermissions.request`; never
  trigger overlapping microphone/notification/photo prompts simultaneously.
- iOS Simulators lack a reliable physical microphone stream for all speech-recognition backends;
  never substitute a fake success when hardware audio input cannot be exercised.
- Backgrounding suspends `requestAnimationFrame`; timers that must fire across lifecycle boundaries
  (such as draft flush on backgrounding) must listen to `AppState` rather than frame callbacks.
