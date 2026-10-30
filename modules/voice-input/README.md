# Voice Input

Local Expo module for offline dictation capture and model storage. `getVoiceInput()` returns null
on clients without this module. JavaScript owns permission prompts through the shared queue.

Both platforms produce mono 16 kHz PCM16 WAV in disposable private storage, with a native 30-second
limit and metering events. iOS uses AVAudioRecorder; Android streams AudioRecord buffers to disk.
Recording does not depend on the system speech recognition service. Completion includes a session
ID so late events cannot settle a newer recording. Cancel joins capture and deletes its file;
backgrounding and interruptions end capture. The caller deletes completed audio after inference.

`modelDirectory()` uses iOS Application Support with backup exclusion and Android noBackupFilesDir.
Downloaded models survive cache eviction and do not enter OS backups or the app's data backup.
Inference is supplied separately by the pinned `@siteed/sherpa-onnx.rn` native dependency.

Native changes require new development clients. Compilation and iOS/Android device acceptance have
not been run for this implementation; microphone interruptions and stop/cancel races need device
acceptance before release.
