# Voice Input And Speech

> Status: engines, attachment transcription and settings are implemented; the chat and settings
> controls are interim and await their UI design. iOS/Android device acceptance is pending.

## Capabilities

| Capability | Default engine | Optional engine |
| --- | --- | --- |
| Dictation into the composer draft | System speech recognition | AI transcription model |
| Reading an assistant reply aloud | System text-to-speech | AI speech model and voice |
| Audio file attachments | AI transcription model | — |

System engines are free, need no setup and spend no tokens. AI engines are optional upgrades that
the user configures once in **Settings → Voice**; voice actions never ask for a provider or model.
Users can also dictate with their keyboard's own voice input, which needs no app support.

## Module Boundaries

`Backend.voice` (`VoiceModule` in `src/shared/contracts/voice.ts`) is the only surface callers use.
Callers never pick an engine: they start dictation, read text, and observe the current activity.

`src/backend/services/voice` owns the implementation:

- `engines.ts` declares the `DictationEngine` and `SpeechEngine` ports. An engine may serve one
  capability only; a missing engine is unsupported.
- `VoiceRuntime.ts` is the only place that chooses an engine. An explicit preference is used as is;
  with none (`null`), the first engine in `VOICE_ENGINES` the device supports is used. The runtime
  allows one activity at a time: dictation stops reading, reading replaces reading, and reading
  cannot start during dictation. Backgrounding the app and host disposal abort the activity. It
  turns Markdown into prose (`speechText.ts`) before any engine sees it.
- Each native library appears in exactly one adapter: `systemDictation.ts`
  (`expo-speech-recognition`), `systemSpeech.ts` (`expo-speech`), `aiDictation.ts` (`expo-audio`
  recording) and `aiSpeech.ts` (`expo-audio` playback). Adapters own their permissions, native
  resources and cleanup.
- `createVoice.ts` assembles the engines for the host. Adding an engine means one adapter, one
  `VOICE_ENGINES` entry and one registration there; callers and the runtime do not change.

The frontend uses `useBackendModule('voice')` only. Chat owns the dictation and read-aloud hooks in
`src/frontend/features/chat/voice`; settings owns `src/frontend/features/settings/voice`.

Dictation owns only the text it appended to the draft. A write applies only while the draft is
still what dictation last wrote, so typing or sending during dictation hands the draft back to the
user. Only stopping keeps the dictated text. Cancelling, backgrounding and any failure release the
session and restore the earlier draft; failures other than cancelling are reported.

## Engines

**System dictation** uses Apple's Speech framework on iOS and Android's `SpeechRecognizer`. It runs
in continuous mode with live partial results; each final utterance is appended with
`appendUtterance`, which adds no spaces between Chinese or Japanese utterances. On Android the
engine currently requires a Google recognition service (`GOOGLE_RECOGNITION_SERVICES`); devices
without one report it as unsupported and settings disables it. Vendor recognizers such as Xiaomi's
implement the same `RecognitionService` and are a candidate once verified on devices. The config
plugin declares the Google packages for Android package visibility.

**AI dictation** records mono 16 kHz AAC (M4A) for up to ten minutes, then sends the recording once
to the transcription model and deletes it. It has no live text: the transcript arrives on stop.

Each transcription request states the audio's container type. The SDK's own byte sniffing reads
MP4/M4A as WAV and would name the upload `audio.wav`; attachments take their type from
`transcriptionMediaType`.

**System speech** reads through the platform engine, split to Android's input limit, with an
optional system voice for the app language.

**AI speech** splits prose into requests of at most 4,096 characters at sentence boundaries,
generates the next part while the current one plays, and deletes each WAV after playback. A part
that cannot play fails the reading. A pause or stop the reading did not request, such as an audio
interruption, also fails it in both speech engines, instead of waiting for playback to resume. The
voice list is OpenAI's; a compatible gateway rejects the voices it lacks.

System speech uses the resolved app language. System dictation uses
`feature.voice.dictation_language`, which follows the app language when null; settings show it only
while the system engine dictates. AI transcription detects the language itself.

## Audio Attachments

Audio is an attachment mode in `fileAttachmentPolicy`, recognized by media type or by extension
because pickers often label audio generically or as video. The accepted formats and the 25 MB
limit follow the OpenAI transcription protocol. Painting does not accept audio.

`readAttachmentContent` reads audio through the reader's optional `transcribeAudio` port, so the
file service never depends on voice or AI. `AgentHostDependencies` supplies the port from
`createAudioAttachmentTranscriber`, both for turn attachments and for `read_file` and
`library_read_file`. The transcript reaches the model as a text attachment with an
`[Audio transcript]` header and timed segments when the model returns them; the attachment report
mode is `audio-transcript`. Without a transcription model, sending fails with the
`transcription-unconfigured` attachment issue; a failed request reports `transcription-failed`.

Transcripts are cached in the system cache directory by `audioTranscriptCache` in the file service,
keyed by file id, revision and size, and removed with their entry. A transcript describes the
recording, so later turns, paged reads and model changes do not transcribe again, and a cached
transcript needs no configured model. Losing the cache only costs another transcription. Audio is transcribed only when a turn or tool actually reads it; importing never
transcribes.

## AI Models And Accounts

`feature.voice.transcription_model` serves AI dictation and audio attachments;
`feature.voice.speech_model` serves AI speech. Each is an account plus a free-form model ID,
because audio models are not part of the chat model list. `AiService` resolves the account at
request time and uses the OpenAI audio adapter with its URL, headers and credential
(`resolveVoiceEndpoint`); only API-key accounts with an OpenAI or OpenAI-compatible endpoint
qualify. Each action makes one attempt. Remote conversations also use the local voice settings.

The upstream audio APIs report no token counts or prices, so voice requests create no usage
records; settings states that audio usage is not in the statistics.

Engine choices and the system voice are device-local preferences: engine support and installed
voices differ per device, so a restored backup keeps the target device's values.

## Native Configuration And Acceptance

`expo-speech-recognition` adds the speech recognition purpose string, `RECORD_AUDIO`, and package
visibility for recognition services. `expo-audio` enables foreground recording with background
recording and playback disabled. Camera and image-picker share the same microphone purpose string,
because Expo composes these plugins into one native configuration. These changes need new iOS and
Android development builds; a JavaScript update cannot add the native modules.

Focused tests cover engine choice, the single-activity rule, backgrounding and disposal, Markdown
to prose, request splitting, utterance joining, Android recognizer detection, audio classification
and limits, attachment transcription, caching and failures, transcript paging in `read_file`, and
the composed native configuration. They use native fakes and do not establish device behavior.

Device acceptance on iOS and on Android with and without Google services:

- System dictation: permission grant and denial, live text, Chinese and English, stop, cancel,
  backgrounding, and the disabled engine on Android devices without Google services.
- AI dictation and speech with a real OpenAI-compatible account, including long replies.
- Audio attachments in chat and `read_file`, with and without a transcription model.
