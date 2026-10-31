# Voice Input And Speech

> Status: system dictation, system speech, downloadable SenseVoice dictation and offline audio-file
> transcription are implemented in source.
> The offline native integration and current settings layout still need builds and iOS/Android
> device acceptance. Source implementation does not establish device behavior.

## Capabilities

| Capability | Default | Engine |
| --- | --- | --- |
| Dictation into the composer draft | Off until enabled | System speech recognition or downloaded SenseVoiceSmall |
| Reading an assistant reply aloud | Enabled | System text-to-speech |
| Transcribing an audio file into a text document | Explicit file action or Agent tool; SenseVoice by default | Downloaded SenseVoiceSmall or system on-device recognition |

Voice needs no Cherry provider account. Users select system dictation or download the optional
SenseVoiceSmall model for offline dictation and file transcription. Cloud voice adapters remain
outside this implementation.

System engines do not guarantee offline execution: the configured recognition service, installed
voices and language support determine whether the platform uses a network. The current adapters do
not enforce on-device recognition or filter voices by network requirements. SenseVoice runs locally
after download and never falls back to a system or cloud recognizer.

Users choose a dictation engine in **Settings → Voice**, choose a language for system recognition
or download the offline model, and select an installed speaking voice for reading aloud. They can also dictate through their keyboard's own
voice input, independently of this module.

The local and remote chat composers share one primary action slot: voice input while the draft
and attachments are empty and dictation is enabled and available, send once there is
content, and stop while a reply streams. Dictation off or an unavailable system recognizer keeps
the send action. An offline engine waiting for a model keeps an actionable voice entry that explains
where to download it. Dictation keeps the slot until it ends, even as text fills the draft; there it
finishes dictation with a check mark and shows progress while waiting for the final result.

While dictating, cancel replaces the leading attachment action and discards the dictation,
including while the final result is pending. Until text arrives, the placeholder shows listening
with elapsed time, then transcription progress. Adding to a typed draft by voice goes through the
keyboard's own voice input. Reading aloud sits beside copy on a settled assistant reply's toolbar
and turns into stop while that reply is read. Switching, closing or navigating away from the
conversation ends reading, including when another route covers a still-mounted chat screen.

## Module Boundaries

`Backend.voice` (`VoiceModule` in `src/shared/contracts/voice.ts`) is the only surface callers use.
Callers start dictation, read text, transcribe managed audio files and observe activity; the runtime
resolves live voice engines from preferences. File transcription has an independent engine preference, defaults to SenseVoice, and never falls back between engines or to online recognition. The module has no dependency on `AiService`, provider accounts or model catalogs.

`src/backend/services/voice` owns the implementation:

- `engines.ts` declares the `DictationEngine` and `SpeechEngine` ports. An engine may serve only one
  capability; a missing entry is unsupported.
- `VoiceRuntime.ts` chooses the engine from the registered `VOICE_ENGINES` IDs. With no valid
  selection, dictation is off and speech uses the first supported entry. `system` and `sensevoice`
  are registered for dictation; only `system` reads aloud. The runtime allows one activity at a time:
  dictation stops reading, reading replaces
  reading, and reading cannot start during dictation or file transcription. Backgrounding aborts
  capture/playback; file transcription follows its caller’s cancellation signal so Agent work can
  use the existing turn execution lease. Host disposal aborts every activity. A permission dialog opened through the system prompt queue does not count as leaving
  the app, even when Android reports `background` behind it. Disposal waits for pending work.
- `speechText.ts` turns Markdown into prose and splits speech into utterances within the system's
  input limit, preserving sentence boundaries where possible.
- `systemDictation.ts` owns `expo-speech-recognition`, permissions, native listeners and cleanup.
  `systemSpeech.ts` owns `expo-speech`, installed voice selection and speech cancellation.
  `audioSession.ts` configures the shared audio session through `expo-audio` so reading aloud plays
  with the iOS ring switch silenced.
- `senseVoiceDictation.ts` owns local recording and cleanup. `senseVoiceRecognition.ts` shares lazy
  native inference and model-use leases with `senseVoiceTranscription.ts`, which decodes and
  recognizes bounded file windows. `transcribeAudioFile.ts` validates managed sources and publishes
  the generated text through the existing file commit boundary.
  `voiceModel.ts` owns the optional model's download, integrity and deletion through `localModel`.
- `createVoice.ts` assembles the engines, model owner and background listener for the host. Adding a
  future engine requires an adapter, a `VOICE_ENGINES` entry and registration here.

The frontend uses `useBackendModule('voice')`. Chat owns the dictation and read-aloud hooks in
`src/frontend/features/chat/voice`; settings owns `src/frontend/features/settings/voice`.

Dictation owns only the text it appended to the draft. The composer announces explicit edits and
accepted sends before changing the draft, so clearing it or returning to an earlier recognition
result also cancels the session and hands the draft back. Only finishing keeps the dictated text.
Cancelling, navigating away, backgrounding and failure release the session and restore the earlier
draft unless the user has taken it over; failures other than caller cancellation are reported.

## System Engines

**System dictation** uses Apple's Speech framework on iOS and Android's `SpeechRecognizer`. It runs
in continuous mode with live partial results; each final utterance is appended with
`appendUtterance`, which adds no spaces between Chinese or Japanese utterances. On Android the
engine checks `isRecognitionAvailable()` and uses the configured default `RecognitionService`,
including vendor implementations. It does not select a Google package or use a vendor allowlist.
An installed Android service without a selected default reports `needs-setup`, not unsupported.
The enabled composer action remains available to explain the missing system setup before requesting
microphone access. Android voice settings offer a guidance entry when system input is selected.
Both use a short, device-independent instruction, then open system settings only on the user's
action. The app never selects a service or writes Android's default-service setting.

Settings navigation lets the device resolve the public voice-input settings action, falling back
to default-app settings and then system settings when that action is unavailable. Xiaomi devices
open system settings directly: HyperOS 4 / Android 17 on the tested M610BB
resolves voice-input settings to the default digital assistant screen, which offers no recognition
service selector. The app does not guess OEM-private component names or treat opening a settings
activity as proof that a service can be selected. Some devices do not expose a service selector;
guidance includes a settings search term. Keyboard dictation remains an independent alternative.
Returning from settings refreshes engine status through the shared query focus bridge. Other
manufacturers and system versions still require device acceptance.

The config plugin declares the generic `android.speech.RecognitionService` query for package
visibility. Recognition quality and support for languages, partial results and continuous mode
depend on the device service.

**System speech** reads through the platform engine, split to its input limit. Before speaking, it
resolves an installed voice for the app language: the default prefers an exact locale match, then
another voice in that language. A saved selection must still be installed and match the app
language; otherwise reading reports an invalid voice so the user can select another. Passing the
resolved ID also avoids `expo-speech` 58's Android language-tag parsing fallback to the device
language. A speech error or an unexpected stop, such as an audio interruption, fails reading.
Cancellation also settles when native stop completes, even if no utterance callback arrives.

Settings exposes the installed voice selection directly, without a single-option engine picker.
System voices are filtered by the app language and deduplicated by their native selection ID.
Different IDs with the same display name remain selectable with language/ID details. The voice
list refreshes when the app language changes and when returning to voice settings.

System speech uses the resolved app language. Dictation uses `feature.voice.dictation_language`,
which follows the app language when null. Engine choices and the system voice are device-local
preferences: support and installed voices differ per device, so a restored backup keeps the target
device's values.

## Downloaded Offline Dictation

SenseVoiceSmall INT8 supports iOS and Android through `@siteed/sherpa-onnx.rn` 1.3.1 (sherpa-onnx
1.13.0). The dependency is loaded only when offline dictation starts. Missing native modules report
unsupported while system voice remains available. The Expo packaging plugin uses this app's SDK 58
config-plugin version; its installation script downloads prebuilt libraries rather than compiling.

The user selects **Settings → Voice → Input method → Offline**, then downloads the model from its
row. The row groups the model name, size or current status, and download/cancel/delete action. The pinned
`senseVoiceAssets.ts` manifest contains a ModelScope revision, exact sizes and SHA-256 values for
`model.int8.onnx` and `tokens.txt`, totaling 239,549,735 bytes (about 240 MB). The model source is
[pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue](https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue);
the upstream model and its licensing information are
[FunAudioLLM/SenseVoiceSmall](https://huggingface.co/FunAudioLLM/SenseVoiceSmall).
Model weights are not bundled in the app or copied from DSH Go source.

The shared [file downloader](../../src/backend/services/download/README.md) owns native transfer,
progress, byte limits, cancellation, temporary-file cleanup and checksum verification. Settings
observes the backend-owned operation; leaving settings does not cancel it. Retry reuses complete
verified assets and restarts an interrupted file. Model storage survives cache eviction and is
excluded from OS backup. A new app generation verifies cached bytes before use. Deletion is blocked
while recognition holds a model lease; disposal cancels downloads and joins active native work.

[`modules/voice-input`](../../modules/voice-input/README.md) records 16 kHz mono PCM16 WAV, with a
native 30-second limit. Stop or the limit transitions the composer to transcription. SenseVoice
automatically detects Mandarin, Cantonese, English, Japanese or Korean; the system recognizer's
language preference does not restrict it. The first version transcribes whole utterances and does
not need a separate VAD model. It does not stream partial text. Audio is processed locally, deleted
after completion/cancellation, and never sent to a provider. Native inference cannot be interrupted
mid-decode: cancellation discards its result and joins it before releasing the recognizer/model.

## Audio File Transcription

The audio file menu in the library starts transcription, shows progress, and offers cancellation.
Closing its panel or unmounting the library cancels its operation. Keep the app foregrounded until
it finishes. Success creates a separate `.txt` file beside the recording and opens through the
existing text viewer; the source audio is unchanged. Missing models link to voice settings rather
than starting a download automatically. Dictation does not need to be enabled for file transcription.

Audio attachments enter local Agent turns as metadata and managed file references, never raw audio
bytes. The built-in `transcribe_audio` tool is offered only with tool calling, a ready selected
transcription engine and a native decoder. It accepts an attached file ID or a relative workspace path, uses the same voice
module as the UI, and creates a text artifact in the captured workspace (library root otherwise).
The Host grants that artifact for subsequent `read_file` calls. Like `write_file`, this local
document-producing tool is auto-approved.
Models without the tool receive an explanation of how to transcribe from the file menu.

Chat audio attachments use a waveform icon and format label, with the existing remove and
system-open actions. The local composer explains engine availability and links to voice settings
when the selected engine needs configuration. A ready engine still requires a chat model that can call tools;
sending an attachment does not itself run transcription before the Agent receives the turn.
`VoiceActivity` publishes the active file, optional caller key, and completed/total audio seconds.
Chat attachment tiles observe their own file and tool rows observe their own call, so a cancelled
or completed operation cannot show progress on an unrelated message. The tool receipt presents
the saved filename or localized failure; its managed TXT artifact uses the normal file card.
Common audio extensions are inferred only at import when no specific media type is available.

Sources are limited to 100 MiB and two hours. `VoiceInput.decodeAudioChunk` reads at most 30 seconds
into a temporary mono PCM16 WAV, using AVAudioFile on iOS and MediaExtractor/MediaCodec on Android.
Supported containers and codecs depend on the platform; WAV, MP3 and M4A are intended common inputs.
The recognizer consumes one window at a time and releases each temporary file before decoding the
next. Cancellation waits for the active decode/inference to settle, discards the result and releases
native resources (and the SenseVoice model lease). Partial transcripts are not published. A source removed or changed during
recognition fails before publication; destination liveness is checked by file storage.

The **Audio file transcription** section in Voice settings owns a separate engine and recording
language. Engine choice is device-local and defaults to SenseVoice; system language follows the app
unless selected explicitly. It does not change dictation or reading settings. Both engines use the
same chunk loop, file limits, progress, cancellation and managed artifact publication.

The system engine uses `VoiceInput.systemTranscriptionStatus`, `transcribeAudioChunk` and
`cancelTranscription`. iOS checks `SFSpeechRecognizer` for the selected locale and always sets
`requiresOnDeviceRecognition` on `SFSpeechURLRecognitionRequest`; it requests Speech authorization,
not microphone access. Android requires API 33+, an on-device recognition service and the exact
language in `installedOnDeviceLanguages`. It checks recognition support for the file request and
streams the decoder's mono PCM16 payload through `EXTRA_AUDIO_SOURCE`, with the actual sample rate.
Only segmented completion after the complete input is accepted. Android's system API requires
`RECORD_AUDIO` permission even for supplied audio; the app does not start its capture module.
A missing language pack or uncheckable service fails without online or SenseVoice fallback.
Each system window has a 60-second deadline; cancellation closes native work before cleanup.

Android services own file-source support: the platform may ignore unsupported input extras and
open its microphone. Capability checks and rejection of non-segmented results cannot prove vendor
behavior. Device acceptance must establish supplied-file use, offline operation, denied permissions,
unsupported languages, cancellation and repeated windows on each supported service. See the
[Android file-source contract](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_AUDIO_SOURCE)
and [Apple on-device request contract](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).

SenseVoice detects its supported languages automatically. This implementation produces plain text,
without speaker identification or word timestamps. Fixed window boundaries may affect words at a
boundary. A new native client is required; older clients report transcription as unavailable.

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

- Audio-file WAV/MP3/M4A decoding on both platforms, stereo input, long recordings across window
  boundaries, silence, corrupt files, cancellation during inference, model deletion while busy,
  source deletion, and generated transcript opening.
- Audio attachment → `transcribe_audio` → `read_file` with a text-only model, denied file access,
  missing model, and unavailable native decoder.
