# Voice Input And Speech

> Status: system dictation, system speech, composer interactions and voice settings are implemented.
> iOS/Android device acceptance of the current settings layout is pending.

## Capabilities

| Capability | Default | Engine |
| --- | --- | --- |
| Dictation into the composer draft | Off until enabled | System speech recognition |
| Reading an assistant reply aloud | Enabled | System text-to-speech |

Voice uses the device's system services and needs no Cherry provider account or model selection.
Cloud voice adapters and audio attachment transcription are outside this implementation. Model
management retains the TTS/STT catalog foundation independently of the voice module.

System engines do not guarantee offline execution: the configured recognition service, installed
voices and language support determine whether the platform uses a network. The current adapters do
not enforce on-device recognition or filter voices by network requirements. Downloadable local
models and strict offline capability checks are not implemented.

Users enable system dictation in **Settings → Voice**, choose its recognition language and select
an installed speaking voice for reading aloud. They can also dictate through their keyboard's own
voice input, independently of this module.

The local and remote chat composers share one primary action slot: voice input while the draft
and attachments are empty and system dictation is enabled and available, send once there is
content, and stop while a reply streams. Dictation off or an unavailable system recognizer keeps
the send action. Dictation keeps the slot until it ends, even as text fills the draft; there it
finishes dictation with a check mark and shows progress while waiting for the final result.

While dictating, cancel replaces the leading attachment action and discards the dictation,
including while the final result is pending. Until text arrives, the placeholder shows listening
with elapsed time, then transcription progress. Adding to a typed draft by voice goes through the
keyboard's own voice input. Reading aloud sits beside copy on a settled assistant reply's toolbar
and turns into stop while that reply is read. Switching or closing the conversation ends reading.

## Module Boundaries

`Backend.voice` (`VoiceModule` in `src/shared/contracts/voice.ts`) is the only surface callers use.
Callers start dictation, read text and observe activity; the runtime resolves the engine from
preferences. The module has no dependency on `AiService`, provider accounts or model catalogs.

`src/backend/services/voice` owns the implementation:

- `engines.ts` declares the `DictationEngine` and `SpeechEngine` ports. An engine may serve only one
  capability; a missing entry is unsupported.
- `VoiceRuntime.ts` chooses the engine from the registered `VOICE_ENGINES` IDs. With no valid
  selection, dictation is off and speech uses the first supported entry. Only `system` is
  registered. The runtime allows one activity at a time: dictation stops reading, reading replaces
  reading, and reading cannot start during dictation. Backgrounding and host disposal abort the
  activity. A permission dialog opened through the system prompt queue does not count as leaving
  the app, even when Android reports `background` behind it. Disposal waits for pending work.
- `speechText.ts` turns Markdown into prose and splits speech into utterances within the system's
  input limit, preserving sentence boundaries where possible.
- `systemDictation.ts` owns `expo-speech-recognition`, permissions, native listeners and cleanup.
  `systemSpeech.ts` owns `expo-speech`, installed voice selection and speech cancellation.
  `audioSession.ts` configures the shared audio session through `expo-audio` so reading aloud plays
  with the iOS ring switch silenced. There is no application recording or generated-audio playback.
- `createVoice.ts` assembles the system engines and the background listener for the host. Adding a
  future engine requires an adapter, a `VOICE_ENGINES` entry and registration here.

The frontend uses `useBackendModule('voice')`. Chat owns the dictation and read-aloud hooks in
`src/frontend/features/chat/voice`; settings owns `src/frontend/features/settings/voice`.

Dictation owns only the text it appended to the draft. Typing or sending during dictation hands
the draft back to the user and cancels the session. Only finishing keeps the dictated text.
Cancelling, backgrounding and failure release the session and restore the earlier draft; failures
other than caller cancellation are reported.

## System Engines

**System dictation** uses Apple's Speech framework on iOS and Android's `SpeechRecognizer`. It runs
in continuous mode with live partial results; each final utterance is appended with
`appendUtterance`, which adds no spaces between Chinese or Japanese utterances. On Android the
engine checks `isRecognitionAvailable()` and uses the configured default `RecognitionService`,
including vendor implementations. It does not select a Google package or use a vendor allowlist.
The config plugin declares the generic `android.speech.RecognitionService` query for package
visibility. Recognition quality and support for languages, partial results and continuous mode
depend on the device service.

**System speech** reads through the platform engine, split to its input limit, with an optional
installed voice for the app language. A speech error or an unexpected stop, such as an audio
interruption, fails reading instead of waiting indefinitely for playback to resume.

System voices are filtered by the app language and deduplicated by their native selection ID.
Different IDs with the same display name remain selectable with language/ID details. The voice
list refreshes when the app language changes and when returning to voice settings.

System speech uses the resolved app language. Dictation uses `feature.voice.dictation_language`,
which follows the app language when null. Engine choices and the system voice are device-local
preferences: support and installed voices differ per device, so a restored backup keeps the target
device's values.

## Native Configuration And Acceptance

`expo-speech-recognition` adds the speech recognition purpose string, `RECORD_AUDIO`, and package
visibility for recognition services. `expo-audio` remains for audio-session control, with background
recording and playback disabled. Camera and image-picker share the microphone purpose string,
because Expo composes these plugins into one native configuration. These native modules require
iOS and Android development clients that contain them; a JavaScript update cannot add the modules.

Existing focused suites cover engine choice, the single-activity rule, backgrounding and disposal,
Markdown to prose, utterance limits, Chinese/Japanese utterance joining, Android recognizer
detection, permission handling, system voice selection, composer cancellation and native plugin
configuration. They use native fakes and do not establish device behavior.

Device acceptance remains necessary on iOS and on Android with Google and vendor recognition
services:

- System dictation permission grant and denial, live text, Chinese and English, finish, cancel and
  backgrounding.
- Composer send fallback with dictation off or no available system recognition service.
- System voice deduplication, same-name voice labels and language changes.
- Reading long replies, reading in silent mode, interruption and leaving the conversation.
