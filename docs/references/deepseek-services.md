# DeepSeek Services

Status: implemented in Mobile source; live-provider, automated, build and device acceptance have
not been run for this change. The published Cherry Studio packages are unchanged.

## Configuration And Ownership

**Settings → DeepSeek services** stores `feature.deepseek.services`: an existing Provider ID,
the service address, per-feature opt-ins and the selected speaking voice. It stores no copied
API key. Provider records and `ProviderService.resolveApiKey` remain authoritative for enabled
credentials and rotation. The settings route links to the selected Provider's key editor.

The service address defaults to `https://api.deepseek.com`, independently of the Provider's chat
endpoints. The user must select an official DeepSeek account or a compatible gateway; selecting
an arbitrary Provider does not give its keys access to DeepSeek. Address validation rejects
embedded credentials, query parameters and fragments. Service paths supply their own API version.

`services/providers/deepseekConnection.ts` receives live preferences from composition and resolves
one credential per OCR/voice operation. `deepseekHttp.ts` uses the existing bounded, cancellable
HTTP client and ordered multipart fields. Domain services own their own results and lifecycles:

| Capability | Mobile owner | Selection |
| --- | --- | --- |
| External Search/Fetch | `services/webSearch`, existing `@cherrystudio/web-search` | Enable key sharing and select DeepSeek on the built-in web tool pages |
| OCR | `services/file/deepseekOcr.ts`, existing controlled readers | Enable cloud text extraction |
| Model document input | Host attachment admission, Pi wire adapter, `services/file/deepseekFiles.ts` | Enable document input and select this Provider's exact `deepseek-flash` model |
| Dictation/audio transcription | `services/voice/deepseekRecognition.ts` | Select DeepSeek separately for each capability in Voice settings |
| Read aloud | `services/voice/deepseekSpeech.ts` | Select the DeepSeek speech engine and Stella or Tide |
| Native web tools/content checks | Existing Pi model payload/response owners | Per-feature opt-in for this Provider's exact `deepseek-flash` model |

All cloud switches default off. A configured Provider does not automatically replace a voice
engine or choose an external web provider. Missing credentials report unavailability; recognition
never silently switches between local and cloud engines. Automatic speech-engine selection
excludes the cloud engine.

## Files And OCR

Without the document opt-in, the existing local parser and bounded text/IR preparation remain.
With it, the Host validates the managed reference and prepares a `provider-document` report rather
than parsing supported PDF, Word, PowerPoint, Excel or EPUB attachments. The Runtime part carries
the managed ID, media type and source revision. Pi keeps that application-owned metadata on a text
part in its JSON history; plain user text cannot grant access to another file.

At each actual model attempt, `piDeepseekFiles.ts` delegates upload to the file service using that
attempt's serving credential, including credential fallback and explicit authentication headers.
Conflicting authentication headers fail before upload because they cannot confirm one file-owning
account.
It replaces only prepared attachment envelopes with the protocol's native file blocks. The
Anthropic endpoint also receives the Files beta header. No new conversation engine or file table
is introduced.

The managed local original remains authoritative. The file service checks its current revision
and content hash, snapshots mutable sources, validates again after upload, and releases temporary
snapshots. The disposable `Paths.cache/DeepseekFiles` mapping contains remote IDs and expiry only,
keyed by managed ID, content hash, purpose, host and a hash of the actual credential. Different
keys are isolated because Mobile has no confirmed remote account identity. Before reusing a
reference, the service checks the remote file and rechecks the local source. A missing/expired
reference is uploaded again; an edited or unavailable source fails rather than using stale bytes.
Uploads request a 24-hour server expiry, and local mappings are bounded to 256 entries. Local
deletion does not promise immediate remote deletion. Original downloads are not available through
the upstream Files API, so a remote ID never replaces the managed original.

For example, attaching a PDF to `deepseek-flash` sends a remote file reference while retaining the
PDF locally. A follow-up reuses a confirmed reference under the same credential. After expiry or
cache eviction, Mobile rebuilds it from the current managed source. The server's 20-reference
limit includes historical occurrences; ordinary attachment byte limits still apply. Parsed
document text is not included in Pi's local text estimate, so the provider can reject a document
context that exceeds its own limit instead of silently truncating it.

Cloud OCR is a separate opt-in for controlled image/document text readers, including `read_file`.
It replaces local parsing for admitted image, PDF, Word and PowerPoint inputs when text extraction
is needed; direct vision input is unchanged. It checks complete page results and HTTP-200 error
objects, removes OCR layout markers, bounds returned text, and reports the actual `deepseek-ocr`
parser. Its content/credential-scoped entries reuse the existing bounded text cache. Cloud
failures do not start a second local parser. OCR returns text only, including for Office files;
it does not preserve their AnyDoc structure or embedded pixels.

Turning document input off stops future uploads, including references retained in a Pi working
copy. Existing envelopes still identify the local original for an ordinary `read_file` operation;
new attachments follow the current local preparation path. A rebuilt copy reparses visible
historical attachments through that path as well.

## Voice And Conversation Protocols

`recordedDictation.ts` owns the existing native WAV capture, cancellation and cleanup for both
SenseVoice and DeepSeek. DeepSeek ASR consumes complete recordings or the existing bounded
30-second decoded WAV windows. Long-file transcription still publishes one managed text document
through `transcribeAudioFile`. This is batch recognition, not live partial dictation.

DeepSeek read aloud uses the existing voice activity and audio-session owner. It converts a settled
answer to prose, synthesizes bounded WAV utterances, plays them sequentially and deletes temporary
audio on completion, failure or cancellation. Playback errors and interruptions settle the activity.
WebSocket synthesis while an answer is still being generated is deferred; the current toolbar reads
settled replies. Existing session naming continues through the normal text generator.

The Pi adapter declares `deepseek_web_search` and `deepseek_read_url` only through the Host's
existing web routes and permissions. Messages retains original server blocks; Responses restores
raw web-call items at their output positions; Chat Completions retains full `server_tool_calls`
and final-step reasoning. Signed link state is replayed only to the same Provider/model/protocol.
Citation display converts DeepSeek's Unicode code-point indices without rewriting signed text.
Native Chat tool progress commits a credential attempt before any answer text, preventing another
key from repeating a search already started. Older native-tool declarations remain the default.

Enhanced content checks add `safety_check` to the selected model request. Both successful and
failed terminal stream events honor a late refusal: displayed text and reasoning are replaced by
an empty terminal message with the existing content-filter error, and the settled transcript keeps
that cleared content. Web-enabled requests also handle refusal without the enhanced-check opt-in.

## API References

- [Files and document input](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/),
  [file ownership and expiry](https://api-docs.deepseek.com/zh-cn/guides/files_api/)
- [OCR](https://api-docs.deepseek.com/zh-cn/guides/ocr/),
  [ASR](https://api-docs.deepseek.com/zh-cn/guides/asr/),
  [TTS](https://api-docs.deepseek.com/zh-cn/guides/tts/)
- [Native web tools and replay](https://api-docs.deepseek.com/zh-cn/guides/web_tools/),
  [content-check terminal behavior](https://api-docs.deepseek.com/zh-cn/guides/safety/)
