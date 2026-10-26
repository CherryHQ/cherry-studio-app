# Voice Input And Speech

> Status: system/cloud engines, attachment transcription and settings are implemented.
> iOS/Android device acceptance of the current settings layout is pending.

## Capabilities

| Capability | Default engine | Optional engine |
| --- | --- | --- |
| Dictation into the composer draft | Off until selected | System recognition or AI transcription |
| Reading an assistant reply aloud | System text-to-speech | AI speech model and voice |
| Audio file attachments | AI transcription model | — |

System engines are free, need no setup and spend no tokens. AI engines are optional upgrades that
the user configures once in **Settings → Voice**; voice actions never ask for a provider or model.
Users can also dictate with their keyboard's own voice input, which needs no app support.

Settings groups controls by capability. Each group opens its engine choices in a sheet, then shows
only the selected engine's controls: recognition language for system dictation, and the model and
voice for cloud speech. The transcription model has its own group because both cloud dictation and
audio attachments use it. Both model rows reuse the shared model picker, filtered to speech
synthesis (TTS) or transcription (STT). Selecting the current model again clears the selection.
Add voice models in the existing provider model settings; account credentials are reused.

Cloud speech defaults to **Automatic**, resolved by the selected model's adapter (for example,
`alloy` for OpenAI and `Kore` for AiHubMix Gemini). A user can override it with one of that model's
voices. Custom compatible models without a declared voice catalog require an explicit voice ID.
Changing the speech model saves the model and voice together: a supported explicit voice survives;
otherwise the choice returns to automatic. Settings refresh their voice options when the model,
language or provider registry changes, and when returning from account/model settings.

The chat composer has one primary action slot: voice input while the draft and attachments are
empty and a configured dictation engine is available, send once there is content, and stop while a
reply streams. With dictation off, no system recognizer, or no available selected AI transcription
model/account, it keeps the send action. Dictation can be turned off again in voice settings.
Dictation keeps the slot until it ends even as its text fills the draft. Adding to a typed draft by
voice goes through the keyboard's own voice input. Reading aloud sits beside copy on a settled
assistant reply's toolbar and turns into stop while that reply is read.

## Module Boundaries

`Backend.voice` (`VoiceModule` in `src/shared/contracts/voice.ts`) is the only surface callers use.
Callers never pick an engine: they start dictation, read text, and observe the current activity.

`src/backend/services/voice` owns the implementation:

- `engines.ts` declares the `DictationEngine` and `SpeechEngine` ports. An engine may serve one
  capability only; a missing engine is unsupported.
- `VoiceRuntime.ts` is the only place that chooses an engine. An explicit preference is used as is;
  with none (`null`), dictation is off and speech uses the first supported `VOICE_ENGINES` entry. The runtime
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
engine checks `isRecognitionAvailable()` and uses Android's configured default `RecognitionService`,
including vendor implementations. It does not select a Google package or use a vendor allowlist.
The installed config plugin already declares the generic `android.speech.RecognitionService` query
for package visibility. Availability is a platform capability check; recognition quality and support
for language, partial results and continuous mode still depend on the selected device service.

**AI dictation** records mono 16 kHz AAC (M4A) for up to ten minutes, then sends the recording once
to the transcription model and deletes it. It has no live text: the transcript arrives on stop.

Each transcription request states the audio's container type. The SDK's own byte sniffing reads
MP4/M4A as WAV and would name the upload `audio.wav`; attachments take their type from
`transcriptionMediaType`. The platform-neutral audio adapter preserves that type. Mobile preboot
installs a coherent Expo-backed `Blob`, Web `File` and FormData entry adapter, so the SDK's file
construction and multipart filename override preserve the original bytes. The URI-based
`expo-file-system` File is a separate API and is not installed as the Web File constructor.

**System speech** reads through the platform engine, split to Android's input limit, with an
optional system voice for the app language.

System voices are filtered by the app language and deduplicated by their native selection ID.
Different IDs with the same display name remain selectable with language/ID details. The voice list
refreshes when the app language changes.

**AI speech** reads the model and voice as one configuration snapshot, resolves the effective voice
and request limit once, splits prose at sentence boundaries, generates the next part while the
current one plays, and deletes each audio file after playback. The adapter currently uses a
4,096-character request budget and the upstream one-shot API's WAV output. The player validates
the returned media type before choosing a file extension. A part
that cannot play fails the reading. A pause or stop the reading did not request, such as an audio
interruption, also fails it in both speech engines, instead of waiting for playback to resume. The
engine owns playback and cleanup; provider voice catalogs and defaults belong to `ai-runtime`.

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
`feature.voice.speech_model` serves AI speech. Each identifies a saved model by provider and model
ID. `AiService` loads the current model, checks its availability and voice purpose, resolves its API
model ID and account at request time, and uses the provider's audio adapter with the account URL,
headers and credential
(`resolveVoiceEndpoint`); API-key accounts with an OpenAI, OpenAI-compatible or AiHubMix endpoint
qualify. AiHubMix uses its compatible audio URL even when Gemini is the default chat endpoint.
Its audio admission is limited to the supported OpenAI speech/transcription families, Gemini 2.5
Flash/Pro preview TTS and Whisper variants declared in `voiceCapabilities.ts`; catalog audio tags
alone do not establish protocol compatibility. AiHubMix discovery preserves its voice types and
modalities, with canonical metadata correcting known catalog errors for the supported families.
Realtime and multimodal audio chat models are not TTS choices. Previously entered model IDs
must exist in the model catalog with the correct voice type. Each action makes one attempt. Remote
conversations also use the local voice settings.

Discovery metadata, model admission, settings choices and execution share the same capability
resolver, keyed by adapter family and the canonical API model ID. OpenAI protocol compatibility
alone does not imply OpenAI voices. The local workspace `ai-runtime` owns these rules and reuses
the existing AiHubMix provider factory; the published `ai-core` dependency remains unchanged.
An empty saved voice means automatic at the application boundary. Before calling `ai-core`, the
adapter's default becomes an explicit protocol voice because the upstream API requires one.
Invalid explicit voices fail before the request instead of being silently replaced or retried.

Request failures record operation, stage, account/model IDs, elapsed time and status/error code
through the application logger, without request text, audio, credentials or response bodies.
Cancellation is not logged as failure. Closed error codes distinguish configuration, upload
encoding and playback failures; the UI translates those codes rather than exposing provider text.

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
the composed native configuration. Cloud regressions also cover model-specific defaults, explicit
voice validation, configuration snapshots, multipart bytes/filenames and safe failure logs.
They use native fakes and do not establish device behavior.

Device acceptance on iOS and on Android with Google and vendor recognition services:

- System dictation: permission grant and denial, live text, Chinese and English, stop, cancel,
  backgrounding, and the disabled engine on Android devices without any recognition service.
- Composer send fallback with dictation off or its AI model/account missing or unavailable.
- System voice deduplication and same-name voice labels.
- AI dictation and speech with a real OpenAI-compatible account, including long replies.
- AiHubMix Gemini speech with automatic `Kore`, switching between OpenAI/Gemini models, and an
  explicit incompatible saved voice. Verify actual playback, not only successful generation.
- WAV/M4A multipart bytes, media type and filename on both native platforms, plus existing binary
  uploads affected by the shared Blob/File/FormData setup.
- Audio attachments in chat and `read_file`, with and without a transcription model.
