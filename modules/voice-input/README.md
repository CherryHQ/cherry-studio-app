# Voice Input

Local Expo module for offline dictation capture, bounded audio-file decoding, strict system on-device file recognition and model storage. `getVoiceInput()` returns null
on clients without this module. JavaScript owns permission prompts through the shared queue.

Both platforms produce mono 16 kHz PCM16 WAV in disposable private storage, with a native 30-second
limit and metering events. iOS uses AVAudioRecorder; Android streams AudioRecord buffers to disk.
Recording does not depend on the system speech recognition service. Completion includes a session
ID so late events cannot settle a newer recording. Cancel joins capture and deletes its file;
backgrounding and interruptions end capture. The caller deletes completed audio after inference.

`modelDirectory()` uses iOS Application Support with backup exclusion and Android noBackupFilesDir.
Downloaded models survive cache eviction and do not enter OS backups or the app's data backup.
Inference is supplied separately by the pinned `@siteed/sherpa-onnx.rn` native dependency.

`decodeAudioChunk(uri, startSeconds, durationSeconds)` reads a local audio file without microphone
permission or changes to the audio session. Windows are at most 30 seconds; each returns a temporary
mono PCM16 WAV, total duration and end offset. iOS uses AVAudioFile seeking and bounded buffers;
Android seeks MediaExtractor, decodes with MediaCodec, clips preroll by timestamps and downmixes
PCM buffers. Native sample rates are retained for the recognizer’s resampler. The JavaScript owner
serializes these calls and deletes every completed window. Partial native outputs are removed on
failure; the first window clears leftovers from an interrupted prior process. Supported codecs
follow the platform. Older native clients without this function report file transcription unavailable.

`systemTranscriptionStatus(language)` checks the selected language's offline capability.
`transcribeAudioChunk(id, uri, language)` consumes a decoded window; `cancelTranscription(id)`
cancels that request. iOS uses a file URL recognition request with an unconditional on-device flag,
after checking the same locale. Android requires API 33+, uses only `createOnDeviceSpeechRecognizer`,
checks the installed offline language and exact file intent, then streams PCM without the WAV header
through a bounded pipe. It rejects non-segmented or premature completion. Requests time out after
60 seconds; cancellation settles only after the Android writer has closed. The app's shared voice
runtime serializes these requests with dictation. Neither implementation selects a network service.
Android service compliance with file-source extras still requires device acceptance; the API may
ignore unsupported extras. JavaScript requests Speech access on iOS and the system API's required
microphone permission on Android before a file operation.

Native changes require new development clients. Compilation and iOS/Android device acceptance have
not been run for this implementation; microphone interruptions and stop/cancel races need device
acceptance before release.
