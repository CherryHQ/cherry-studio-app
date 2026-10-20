# Voice Input And Speech

> Status: implemented; iOS/Android device acceptance pending.

## Product Flow

The chat input menu opens **Voice input**. The user selects a locally configured provider and an
independent transcription model ID, then records up to two minutes or selects one audio file.
The system picker copies the selected file to cache. Transcription uploads at most 20 MiB and
inserts the resulting text at the composer's current selection through its existing `insertText`
contract. It never replaces the whole draft or sends a message automatically. The user reviews
and edits the result before sending.

A settled assistant message with text exposes **Read aloud**. The dialog lets the user choose a
speech provider/model, voice ID, and editable source text. Generation is explicit, with a
4,096-character limit and no silent truncation. Generated WAV audio starts playing, with controls
to stop or replay from the beginning. Closing the dialog or backgrounding the app stops playback.
These dialogs use CherryUI and the existing composer input-replacement presentation contract.

The provider/model choices are separate preferences for speech and transcription. Neither defaults
to a chat account. Audio model IDs never enter the normal chat picker. Suggested OpenAI model IDs
are examples: a compatible gateway must actually expose the selected audio model and endpoints.
Both local and remote conversations use the locally selected voice account; remote provider IDs
are not resolved against local accounts.

## Requests And Ownership

`Backend.voice` is created with each application host. It calls `AiService`, which resolves an
enabled provider at request time, constructs an ephemeral audio model selection, and uses
`resolveAiSdkServing` for the configured base URL, custom headers, and selected API key. The
provider must expose an OpenAI Chat Completions or Responses endpoint with an `openai` or
`openai-compatible` adapter and API-key authentication. IAM and account-sign-in-only providers
are outside this initial audio protocol support.

`packages/ai-runtime/provider` owns the OpenAI audio model adaptation. The generic compatible chat
SDK has no speech/transcription adapter, so this path explicitly uses the OpenAI audio adapter
with the resolved account settings. `ai-core.generateSpeech` and `ai-core.transcribe` receive
resolved V3 models, bytes/text, and an abort signal. Expo fetch and the existing Expo Blob preboot
support the binary/multipart transport. Provider errors use the existing normalized AI failure
contract and credential redaction. Each explicit action makes one attempt; there is no implicit
retry. The user can correct settings and start another action after the previous one settles.

The upstream audio results expose no token counts, billed cost, or provider-call usage events.
`AiUsageRecordService` remains the usage owner, but receives no fabricated language-token or
zero-cost record. The dialog explicitly says voice usage/cost are unavailable in statistics.

## Native Resources And Cancellation

`expo-audio` owns microphone recording and native playback. Microphone permission requests use
`DevicePermissions.runWithSystemPrompt`, preserving the shared system-prompt queue. Denial prevents
recording; permanent denial offers the existing explicit system-settings action. Temporary iOS
`inactive` transitions for system dialogs do not cancel the operation; background transitions do.

The input dialog owns recording files and picker cache copies. It deletes them on replacement,
background, or unmount, waiting for an in-flight upload to settle before deleting its input.
It never deletes the user's original selected document. A preparation result arriving after
cancellation is stopped and discarded rather than starting a recording.

The backend writes speech output into a unique per-host cache directory and returns an opaque
lease ID and local URI. The dialog pauses and detaches the player before releasing its lease.
Unknown release IDs cannot address arbitrary files. Cancelled generation that finishes writing a
file releases it before rejecting. Host disposal aborts and drains outstanding voice work and
removes its temporary directory before the rest of the host is uninstalled. Files are transient;
voice operations do not create jobs, attachments, or durable conversation/usage records.

## Native Configuration And Acceptance

The Expo config plugin enables foreground recording, adds the microphone purpose string, and
explicitly disables background recording/playback support. Android's previous blocked
`RECORD_AUDIO` permission is removed. Camera and image-picker plugins share the audio microphone
purpose string: setting their microphone permission to `false` would remove the iOS purpose or
block Android recording when Expo composes the native configuration. These native changes require
new iOS and Android development builds; JavaScript updates alone cannot install the audio module or microphone permissions. Follow
[Local EAS Builds](../guides/local-builds.md) when packaging is explicitly requested.

Focused tests cover protocol request shapes, byte preservation, credential selection, failures,
no retries, host draining, file ownership, permission-denial decisions, stale-result suppression,
and playback cleanup. These use native-port fakes and do not establish microphone or playback
behavior on a device. No native build or interactive acceptance was run for this change.

Authorized device acceptance should cover both iOS and Android using a new development client:

- Fresh permission grant, denial, permanent denial and return from system settings.
- Recording, the two-minute cap, interruption, file selection and oversize/unsupported input.
- Transcription into a nonempty draft and selection, followed by user editing and explicit send.
- Speech generation, audible WAV playback, stop, replay and text-length validation.
- Provider authentication/model failures and network interruption without automatic retries.
- Close, navigate away, background, host replacement and late completions during permission,
  recording preparation, upload, generation, audio-mode setup and playback.

Follow [Parallel Device Testing](../guides/parallel-device-testing.md) for authorized device work.
