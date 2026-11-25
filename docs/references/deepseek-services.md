# DeepSeek Services

Status: implemented in Mobile source, with focused request-compatibility and scripted-transport
regression coverage. Live-provider, build and device acceptance remain separate. The published
Cherry Studio packages are unchanged.

## Configuration And Ownership

The existing **Settings → Model providers → DeepSeek** record owns credentials and addresses for
every DeepSeek capability. There is no separate service page, Provider binding or credential copy.
`ProviderService.resolveApiKey` remains authoritative for enabled credentials and rotation.
The service root comes from that Provider's configured endpoint, removing its standard `/v1` or
`/anthropic[/v1]` protocol suffix while preserving a gateway prefix. Service paths supply their own
API version. A gateway must implement these APIs; configuring its chat endpoint does not prove
that it serves application tools.

**Plugins → Built-in tools** owns separate **Document parsing** and **OCR** pages. Document parsing
stores `file.document_parser.mode`; OCR stores `file.ocr.engine`. A new enterprise profile has its
own model providers, so it does not inherit the OCR engine, and an inherited DeepSeek parser
becomes the default. **Settings → Voice** owns the
three engine selections and `feature.voice.deepseek_voice`. Enhanced content checks live in the
ordinary DeepSeek model Provider page as `chat.deepseek.safety_check`.

`services/providers/deepseekConnection.ts` resolves the live DeepSeek model Provider and one
credential per OCR/voice operation. `deepseekHttp.ts` uses the existing bounded, cancellable
HTTP client and ordered multipart fields. Domain services own their own results and lifecycles:

| Capability | Mobile owner | Selection |
| --- | --- | --- |
| External Search/Fetch | `services/webSearch`, existing `@cherrystudio/web-search` | Select DeepSeek on the built-in web tool pages; credentials and address automatically follow the model Provider |
| OCR | `services/file/deepseekOcr.ts`, existing controlled readers | Select DeepSeek on Plugins → Built-in tools → OCR |
| Model document input | Host attachment admission, Pi wire adapter, `services/file/deepseekFiles.ts` | Select DeepSeek on Document parsing and use the DeepSeek Provider's exact `deepseek-flash` model |
| Dictation/audio transcription | `services/voice/deepseekRecognition.ts` | Select DeepSeek separately for each capability in Voice settings |
| Read aloud | `services/voice/deepseekSpeech.ts` | Select the DeepSeek speech engine and Stella or Tide |
| Native web tools/content checks | Existing Pi model payload/response owners | Native tools follow existing web routing and permissions; enhanced checks are optional in the DeepSeek model Provider page; both require a request without incompatible client tools |

Document parsing defaults to AnyDoc, OCR to on-device recognition, and enhanced checks to off.
A configured Provider does not automatically replace a voice engine or choose an external web
provider. Missing credentials report unavailability and link to the model Provider; recognition
never silently switches between local and cloud engines. Automatic speech-engine selection
excludes the cloud engine.

## Files And OCR

AnyDoc and Built-in retain their existing bounded local text/IR preparation. Selecting DeepSeek
uses native input for `deepseek-flash` on the DeepSeek Provider. Other models receive cloud-extracted
text for PDF, Word and PowerPoint; formats outside that OCR API keep AnyDoc. The captured parser
selection travels through attachment preparation and controlled file reads; it is not reread from
live preferences halfway through an extraction. On the native route, the Host validates the managed reference and prepares a
`provider-document` report rather
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
reference is uploaded again. An edited or unavailable current attachment fails and asks for the
current version. The same confirmed condition on a historical attachment produces a text notice
in the request, so a later turn can continue. Authentication and transport errors still fail.
Uploads request a 24-hour server expiry, and local mappings are bounded to 256 entries. Local
deletion does not promise immediate remote deletion. Original downloads are not available through
the upstream Files API, so a remote ID never replaces the managed original.

For example, attaching a PDF to `deepseek-flash` sends a remote file reference while retaining the
PDF locally. A follow-up reuses a confirmed reference under the same credential. After expiry or
cache eviction, Mobile rebuilds it from the current managed source. Every model request of a turn,
including tool steps, replays the attached documents, so a reference confirmed for the same source
revision is reused for 10 minutes without rehashing or a remote check. The server's 20-reference
limit includes historical occurrences: the newest 20 stay native, and older ones become a notice
to use `read_file`. Ordinary attachment byte limits still apply. Parsed
document text is not included in Pi's local text estimate, so the provider can reject a document
context that exceeds its own limit instead of silently truncating it.

Cloud OCR is independently selected for controlled image and PDF text readers, including `read_file`.
Direct vision input is unchanged. Office documents follow the document parser selection instead
of being overridden by the OCR engine: selecting DeepSeek document parsing uses cloud text
extraction for supported Office formats even if image OCR remains on-device.
Cloud recognition checks complete page results and HTTP-200 error
objects, removes OCR layout markers, bounds returned text, and reports the actual `deepseek-ocr`
parser. Its content/credential-scoped entries reuse the existing bounded text cache. Cloud
failures do not start a second local parser. OCR returns text only; it does not preserve AnyDoc
structure or embedded pixels.

The Agent's file readers describe and use the same captured document parser and OCR engine. The
transcription tool describes its available engine and checks that the selection still matches at
execution. A recovered tool call fails if its resolved settings differ from the stored tool settings.

Selecting AnyDoc or Built-in stops future uploads, including references retained in a Pi working
copy. Existing envelopes still identify the local original for an ordinary `read_file` operation;
new attachments follow the current local preparation path. A rebuilt copy reparses visible
historical attachments through that path as well.

## Voice And Conversation Protocols

`recordedDictation.ts` owns the existing native WAV capture, cancellation and cleanup for both
SenseVoice and DeepSeek. DeepSeek ASR consumes complete recordings or the existing bounded
30-second decoded WAV windows. If a window's sample rate is unsupported, the DeepSeek adapter
converts it to 16 kHz mono PCM16 for upload and deletes the converted file after use. Long-file
transcription still publishes one managed text document
through `transcribeAudioFile`. This is batch recognition, not live partial dictation.

DeepSeek read aloud uses the existing voice activity and audio-session owner. It converts a settled
answer to prose, synthesizes bounded WAV utterances, plays them sequentially and deletes temporary
audio on completion, failure or cancellation. Playback errors and interruptions settle the activity.
WebSocket synthesis while an answer is still being generated is deferred; the current toolbar reads
settled replies. Existing session naming continues through the normal text generator.

The Pi adapter declares `deepseek_web_search` and `deepseek_read_url` only through the Host's
existing [web routes and permissions](./web-search.md#native-tools-and-selection). On
`deepseek-flash`, these server tools cannot share a request with client function tools. Standard
Agent turns declaring other functions therefore use configured external Search/Fetch, or omit
unavailable web capabilities. When no other functions are declared, native web tools remain
available under the same web policy, including in minimal mode, which has no external fallback.
Messages retains original server blocks; Responses restores raw web-call items at their output
positions; Chat Completions retains full `server_tool_calls`
and final-step reasoning. Signed link state is replayed only to the same Provider/model/protocol.
Citation display converts DeepSeek's Unicode code-point indices without rewriting signed text.
Native Chat tool progress commits a credential attempt before any answer text, preventing another
key from repeating a search already started. Older native-tool declarations remain for other models.

Enhanced content checks add `safety_check: { level: 'high' }` only when enabled and the outgoing
request has no tools or contains only `deepseek_web_search` / `deepseek_read_url`. Pi checks the
actual tool list after the caller's payload hook, recognizing client tools across Chat Completions,
Responses and Messages, including Messages function definitions without a `type` field. A request
with other tools omits `safety_check` to avoid DeepSeek's HTTP 400 tool-mixing rejection; it does
not change the stored preference, so later compatible requests can still enable enhanced checks.
Both successful and failed terminal stream events honor a late refusal: displayed text and
reasoning are replaced by an empty terminal message with the existing content-filter error, and
the settled transcript keeps that cleared content. Web-enabled requests also handle refusal
without the enhanced-check opt-in.

## API References

- [Files and document input](https://api-docs.deepseek.com/zh-cn/guides/document_parsing/),
  [file ownership and expiry](https://api-docs.deepseek.com/zh-cn/guides/files_api/)
- [OCR](https://api-docs.deepseek.com/zh-cn/guides/ocr/),
  [ASR](https://api-docs.deepseek.com/zh-cn/guides/asr/),
  [TTS](https://api-docs.deepseek.com/zh-cn/guides/tts/)
- [Native web tools and replay](https://api-docs.deepseek.com/zh-cn/guides/web_tools/),
  [content-check terminal behavior](https://api-docs.deepseek.com/zh-cn/guides/safety/)
