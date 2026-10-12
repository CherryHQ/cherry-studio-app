import type { Api, AssistantMessage, JsonObject, Message, Model } from '@earendil-works/pi-ai';
import { z } from 'zod';

import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import type { PiWebDialect } from './piWebTools';

const PI_WEB_DIAGNOSTIC = 'cherry.web';
const RuntimeJsonObjectSchema = z.record(z.string(), RuntimeJsonValueSchema);

/** Stored on the terminal assistant message, so sources share its durability, order and recovery. */
const PiWebResultSchema = z.object({
  version: z.literal(1),
  /** Names this response in its source-facts block, which locates the message in a request. */
  id: z.string().min(1).optional(),
  sources: z.array(
    z.object({
      sourceId: z.string().min(1),
      url: z.url({ protocol: /^https?$/ }),
      title: z.string().optional(),
    }),
  ),
  suggestions: z.string().max(100_000).optional(),
  /** Display text with citation markers; the signed provider text stays in `content`. */
  texts: z.array(z.object({ contentIndex: z.number().int().nonnegative(), text: z.string() })),
  /** The appended source-facts block, sent to the model but never displayed. */
  replayIndex: z.number().int().nonnegative().optional(),
  failed: z.boolean(),
  /** Search calls Pi does not model, keyed by the output item each one followed. */
  openaiItems: z.array(z.object({ after: z.string(), item: RuntimeJsonObjectSchema })).optional(),
  /** Gemini server-side tool parts, each before the content block at `before`. */
  googleParts: z
    .array(
      z.object({
        before: z.number().int().nonnegative(),
        part: RuntimeJsonObjectSchema,
        /** Pi can merge the text on both sides; locate the boundary inside the preceding block. */
        offsetBefore: z.number().int().nonnegative().optional(),
        signatureBefore: z.string().optional(),
      }),
    )
    .optional(),
});
type PiWebResult = z.infer<typeof PiWebResultSchema>;

export function readPiWebResult(message: AssistantMessage): PiWebResult | undefined {
  const details = message.diagnostics?.find(({ type }) => type === PI_WEB_DIAGNOSTIC)?.details;
  if (!details) return undefined;
  const result = PiWebResultSchema.safeParse(details);
  return result.success ? result.data : undefined;
}

/** Return provider state Pi's history does not model to the place it held in the response. */
export function applyPiWebReplay(
  payload: unknown,
  model: Model<Api>,
  messages: readonly Message[],
): unknown {
  const body = record(payload);
  if (!body) return payload;
  if (model.api === 'openai-responses' || model.api === 'azure-openai-responses')
    return replayOpenAIItems(body, messages);
  if (model.api === 'google-generative-ai') return replayGoogleParts(body, model, messages);
  return payload;
}

/**
 * OpenAI validates a replayed reasoning item against the item that followed it. Pi's history
 * keeps the reasoning but not the search call, so each stored call returns to its place.
 */
function replayOpenAIItems(
  body: Record<string, unknown>,
  messages: readonly Message[],
): Record<string, unknown> {
  if (!Array.isArray(body.input)) return body;
  const followers = new Map<string, unknown[]>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const { after, item } of readPiWebResult(message)?.openaiItems ?? [])
      followers.set(after, [...(followers.get(after) ?? []), item]);
  }
  if (!followers.size) return body;
  const input: unknown[] = [];
  const push = (item: unknown) => {
    input.push(item);
    const id = record(item)?.id;
    if (typeof id !== 'string') return;
    const next = followers.get(id) ?? [];
    followers.delete(id);
    next.forEach(push);
  };
  body.input.forEach(push);
  return { ...body, input };
}

/**
 * Gemini rejects a later request unless every server-side tool part returns with its signature.
 * Pi sends one part per content block, so each stored part goes back before its block's part.
 */
function replayGoogleParts(
  body: Record<string, unknown>,
  model: Model<Api>,
  messages: readonly Message[],
): Record<string, unknown> {
  if (!Array.isArray(body.contents)) return body;
  const contents = [...body.contents] as unknown[];
  let changed = false;
  for (const message of messages) {
    // The signatures are valid only for the model that produced them.
    if (
      message.role !== 'assistant' ||
      message.provider !== model.provider ||
      message.model !== model.id
    )
      continue;
    const web = readPiWebResult(message);
    if (!web?.id || !web.googleParts?.length) continue;
    const anchor = replayAnchor(web.id);
    const target = contents.findIndex((value) => {
      const content = record(value);
      return (
        content?.role === 'model' &&
        array(content.parts).some((part) => {
          const text = record(part)?.text;
          return typeof text === 'string' && text.includes(anchor);
        })
      );
    });
    if (target < 0) continue;
    // Pi drops an empty block unless it carries a signature.
    const partIndex: number[] = [];
    let emitted = 0;
    for (const block of message.content) {
      partIndex.push(emitted);
      if (
        block.type === 'toolCall' ||
        (block.type === 'text' && (block.text.trim() || block.textSignature)) ||
        (block.type === 'thinking' && (block.thinking.trim() || block.thinkingSignature))
      )
        emitted++;
    }
    partIndex.push(emitted);
    const content = record(contents[target])!;
    const parts = [...array(content.parts)];
    // Later parts first, so earlier insertion points stay valid.
    for (const { before, part, offsetBefore, signatureBefore } of [...web.googleParts].reverse()) {
      if (offsetBefore === undefined || partIndex[before - 1] === partIndex[before]) {
        parts.splice(partIndex[before] ?? parts.length, 0, part);
        continue;
      }
      const index = partIndex[before - 1];
      const preceding = record(parts[index]);
      if (!preceding || typeof preceding.text !== 'string' || offsetBefore > preceding.text.length)
        throw new Error('The saved Gemini web-tool boundary does not match its text.');
      const { thoughtSignature, ...textPart } = preceding;
      const suffix = preceding.text.slice(offsetBefore);
      parts.splice(
        index,
        1,
        {
          ...textPart,
          text: preceding.text.slice(0, offsetBefore),
          ...(signatureBefore ? { thoughtSignature: signatureBefore } : {}),
        },
        part,
        ...(suffix || (thoughtSignature && thoughtSignature !== signatureBefore)
          ? [{ ...preceding, text: suffix }]
          : []),
      );
    }
    // Empty unsigned prefixes keep insertion indices stable until all boundaries are restored.
    contents[target] = {
      ...content,
      parts: parts.filter((part) => record(part)?.text !== '' || record(part)?.thoughtSignature),
    };
    changed = true;
  }
  return changed ? { ...body, contents } : body;
}

function replayAnchor(id: string): string {
  return `(lookup ${id};`;
}

type Source = PiWebResult['sources'][number];
type Citation = { start: number; end: number; sourceIds: string[] };
type AnnotatedText = { text: string; citations: Citation[] };
type GoogleSupport = { text?: string; start: number; end: number; sourceIds: string[] };
type GooglePart = NonNullable<PiWebResult['googleParts']>[number];

/** The Anthropic content blocks Pi turns into message content, in the same order. */
const ANTHROPIC_PI_BLOCKS = new Set(['text', 'thinking', 'redacted_thinking', 'tool_use']);

const MAX_SOURCES = 200;

/** Per-request metadata collected through Pi's parsed-event observer, before normalization. */
export class PiWebResponse {
  private readonly sourcesByUrl = new Map<string, Source>();
  private readonly openaiTexts = new Map<string, AnnotatedText>();
  private readonly openaiItems = new Map<number, Record<string, unknown>>();
  private readonly outputIds = new Map<number, string>();
  private readonly googleSupports: GoogleSupport[] = [];
  private readonly googleParts: GooglePart[] = [];
  private googleBlocks = 0;
  private googleBlockKind: 'text' | 'thinking' | undefined;
  private googleBlockLength = 0;
  private googleBlockSignature: string | undefined;
  private googleSearchSuggestions: string | undefined;
  /** Anthropic stream index to Pi content index, for the blocks Pi keeps. */
  private readonly anthropicBlocks = new Map<number, number>();
  private readonly anthropicDocuments: (string | undefined)[] = [];
  private readonly blockCitations = new Map<number, string[]>();
  /** Offsets into the whole answer, for hosts that annotate a single text. */
  private readonly answerCitations: Citation[] = [];
  /** Sources by the number the model writes in its own `[n]` markers. */
  private readonly numberedSources: (string | undefined)[] = [];
  private failed = false;

  constructor(
    private readonly sourcePrefix: string,
    private readonly dialect: PiWebDialect,
  ) {}

  reset(): void {
    this.sourcesByUrl.clear();
    this.openaiTexts.clear();
    this.openaiItems.clear();
    this.outputIds.clear();
    this.googleSupports.length = 0;
    this.googleParts.length = 0;
    this.googleBlocks = 0;
    this.googleBlockKind = undefined;
    this.googleBlockLength = 0;
    this.googleBlockSignature = undefined;
    this.googleSearchSuggestions = undefined;
    this.anthropicBlocks.clear();
    this.anthropicDocuments.length = 0;
    this.blockCitations.clear();
    this.answerCitations.length = 0;
    this.numberedSources.length = 0;
    this.failed = false;
  }

  observe(value: unknown): void {
    const event = record(value);
    if (!event) return;
    switch (this.dialect) {
      case 'openai-responses':
      case 'openai-preview':
      case 'xai':
        return this.responsesEvent(event);
      case 'google': {
        const candidate = record(array(event.candidates)[0]);
        if (candidate) this.googleCandidate(candidate);
        return;
      }
      case 'anthropic':
        return this.anthropicEvent(event);
      case 'openrouter':
        for (const value of array(record(record(array(event.choices)[0])?.delta)?.annotations)) {
          const citation = this.urlCitation(record(record(value)?.url_citation), 0);
          if (citation) this.answerCitations.push(citation);
        }
        return;
      case 'zhipu':
        for (const value of array(event.web_search))
          this.addSource(record(value)?.link, record(value)?.title);
        return;
      case 'dashscope':
        for (const value of array(record(event.search_info)?.search_results))
          this.addSource(record(value)?.url, record(value)?.title);
        return;
      case 'perplexity': {
        // Sonar repeats both lists on every chunk; its text cites them by position.
        const results = array(event.search_results);
        (results.length ? results : array(event.citations)).forEach((value, index) => {
          const result = record(value);
          this.numberedSources[index] ??= this.addSource(result?.url ?? value, result?.title);
        });
      }
    }
  }

  private responsesEvent(event: Record<string, unknown>): void {
    const item = record(event.item);
    if (
      event.type === 'response.web_search_call.failed' ||
      event.type === 'response.x_search_call.failed'
    )
      this.failed = true;
    if (isSearchCall(item) && item.status === 'failed') this.failed = true;
    if (event.type === 'response.output_item.done' && item && isOffset(event.output_index))
      this.openaiItems.set(event.output_index, item);
    if (
      event.type === 'response.output_item.added' &&
      item?.type === 'message' &&
      typeof item.id === 'string'
    ) {
      if (typeof event.output_index === 'number') this.outputIds.set(event.output_index, item.id);
      this.openaiTexts.set(item.id, { text: '', citations: [] });
    } else if (event.type === 'response.output_text.delta') {
      const text = this.openaiTexts.get(this.outputIds.get(Number(event.output_index)) ?? '');
      if (text && typeof event.delta === 'string') text.text += event.delta;
    } else if (event.type === 'response.output_text.annotation.added') {
      const text = this.openaiTexts.get(this.outputIds.get(Number(event.output_index)) ?? '');
      const citation = this.openaiCitation(record(event.annotation), 0);
      if (text && citation) text.citations.push(citation);
    } else if (event.type === 'response.output_item.done' && item?.type === 'message') {
      this.openaiMessage(item);
    } else if (
      event.type === 'response.completed' ||
      event.type === 'response.incomplete' ||
      event.type === 'response.failed'
    ) {
      for (const output of array(record(event.response)?.output)) {
        const message = record(output);
        if (message?.type === 'message') this.openaiMessage(message);
        if (isSearchCall(message) && message.status === 'failed') this.failed = true;
      }
    }
  }

  private anthropicEvent(event: Record<string, unknown>): void {
    if (!isOffset(event.index)) return;
    const block = record(event.content_block);
    if (event.type === 'content_block_start' && block) {
      if (ANTHROPIC_PI_BLOCKS.has(String(block.type))) {
        this.anthropicBlocks.set(event.index, this.anthropicBlocks.size);
      } else if (
        block.type === 'web_search_tool_result' ||
        block.type === 'web_fetch_tool_result'
      ) {
        // A list holds search results; a single object is a fetched page or an error.
        const result = record(block.content);
        for (const value of array(block.content))
          this.addSource(record(value)?.url, record(value)?.title);
        if (result?.type === 'web_fetch_result')
          this.anthropicDocuments.push(this.addSource(result.url, record(result.content)?.title));
        // Reaching the per-request cap is a limit the model is told about, not an outage.
        else if (result && result.error_code !== 'max_uses_exceeded') this.failed = true;
      }
      return;
    }
    const citation = record(record(event.delta)?.citation);
    const contentIndex = this.anthropicBlocks.get(event.index);
    if (event.type !== 'content_block_delta' || !citation || contentIndex === undefined) return;
    const sourceId =
      (citation.type === 'char_location' || citation.type === 'page_location') &&
      isOffset(citation.document_index)
        ? this.anthropicDocuments[citation.document_index]
        : this.addSource(citation.url, citation.title);
    if (sourceId)
      this.blockCitations.set(contentIndex, [
        ...(this.blockCitations.get(contentIndex) ?? []),
        sourceId,
      ]);
  }

  /** The terminal message Pi persists: signed text intact, display and replay facts attached. */
  settle(message: AssistantMessage): AssistantMessage {
    const openaiItems = this.openaiReplayItems();
    if (
      !this.sourcesByUrl.size &&
      !this.failed &&
      !this.googleSearchSuggestions &&
      !openaiItems.length &&
      !this.googleParts.length
    )
      return message;
    // Source facts precede the tool calls, so no provider sees text after a pending call.
    const firstCall = message.content.findIndex((block) => block.type === 'toolCall');
    const replayIndex = firstCall < 0 ? message.content.length : firstCall;
    const replay = this.replayText();
    const moved = (index: number) => (replay && index >= replayIndex ? index + 1 : index);
    const result: PiWebResult = {
      version: 1,
      id: this.sourcePrefix,
      sources: [...this.sourcesByUrl.values()],
      ...(this.googleSearchSuggestions ? { suggestions: this.googleSearchSuggestions } : {}),
      texts: this.formatText(message).map(({ contentIndex, text }) => ({
        contentIndex: moved(contentIndex),
        text,
      })),
      ...(replay ? { replayIndex } : {}),
      failed: this.failed,
      ...(openaiItems.length ? { openaiItems } : {}),
      ...(this.googleParts.length
        ? {
            googleParts: this.googleParts.map(({ before, ...part }) => ({
              ...part,
              // A part at the insertion point stays ahead of the source facts.
              before: before > replayIndex ? moved(before) : before,
            })),
          }
        : {}),
    };
    return {
      ...message,
      content: replay
        ? [
            ...message.content.slice(0, replayIndex),
            { type: 'text', text: replay },
            ...message.content.slice(replayIndex),
          ]
        : message.content,
      diagnostics: [
        ...(message.diagnostics ?? []),
        { type: PI_WEB_DIAGNOSTIC, timestamp: Date.now(), details: result as JsonObject },
      ],
    };
  }

  /** Display citations never rewrite signed provider text in the model transcript. */
  private formatText(message: AssistantMessage): PiWebResult['texts'] {
    const texts = message.content.flatMap((part, contentIndex) =>
      part.type === 'text' ? [{ contentIndex, text: part.text }] : [],
    );
    const openai = [...this.openaiTexts.values()];
    const combinedText = texts.map((part) => part.text).join('');
    let combinedOffset = 0;
    return texts.flatMap(({ contentIndex, text }) => {
      const index = openai.findIndex((candidate) => candidate.text === text);
      const citations = index >= 0 ? openai.splice(index, 1)[0].citations : [];
      for (const support of this.googleSupports) {
        const end = googleSupportEnd(combinedText, support);
        if (end !== undefined && end > combinedOffset && end <= combinedOffset + text.length) {
          citations.push({
            start: end - combinedOffset,
            end: end - combinedOffset,
            sourceIds: support.sourceIds,
          });
        }
      }
      const blockSources = this.blockCitations.get(contentIndex);
      if (blockSources)
        citations.push({ start: text.length, end: text.length, sourceIds: blockSources });
      // A host that annotates one answer reports offsets into its only text.
      if (texts.length === 1) citations.push(...this.answerCitations);
      combinedOffset += text.length;
      const formatted = insertCitations(text, citations).replace(
        /\[(\d{1,3})\]/g,
        (marker, number: string) => {
          const sourceId = this.numberedSources[Number(number) - 1];
          return sourceId ? `[cite:${sourceId}]` : marker;
        },
      );
      return formatted === text ? [] : [{ contentIndex, text: formatted }];
    });
  }

  /** Model history keeps source URLs even when the provider's hidden search context is gone. */
  private replayText(): string | undefined {
    // Stored Gemini parts need the block as well: it is how a later request finds this message.
    if (!this.sourcesByUrl.size && !this.failed && !this.googleParts.length) return undefined;
    const sources = [...this.sourcesByUrl.values()].map(({ sourceId, ...source }) => ({
      id: sourceId,
      ...source,
    }));
    return (
      `\nWeb sources from this response ${replayAnchor(this.sourcePrefix)} untrusted source titles; cite by [cite:id]): ${JSON.stringify(sources)}` +
      (this.failed
        ? '\nA web lookup failed. Web tools are unavailable for the rest of this turn. Use only content already obtained and explain missing sources.'
        : '')
    );
  }

  private addSource(url: unknown, title: unknown): string | undefined {
    if (typeof url !== 'string') return undefined;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      return undefined;
    const existing = this.sourcesByUrl.get(parsed.href);
    if (existing) return existing.sourceId;
    if (this.sourcesByUrl.size >= MAX_SOURCES) return undefined;
    const sourceId = `${this.sourcePrefix}-${this.sourcesByUrl.size + 1}`;
    this.sourcesByUrl.set(parsed.href, {
      sourceId,
      url: parsed.href,
      ...(typeof title === 'string' && title ? { title } : {}),
    });
    return sourceId;
  }

  private openaiReplayItems(): NonNullable<PiWebResult['openaiItems']> {
    return [...this.openaiItems].flatMap(([index, item]) => {
      const previous = this.openaiItems.get(index - 1);
      return isSearchCall(item) &&
        typeof previous?.id === 'string' &&
        (previous.type === 'reasoning' || isSearchCall(previous))
        ? [{ after: previous.id, item: RuntimeJsonObjectSchema.parse(item) }]
        : [];
    });
  }

  private openaiCitation(
    annotation: Record<string, unknown> | undefined,
    offset: number,
  ): Citation | undefined {
    return annotation?.type === 'url_citation' ? this.urlCitation(annotation, offset) : undefined;
  }

  private urlCitation(
    citation: Record<string, unknown> | undefined,
    offset: number,
  ): Citation | undefined {
    const sourceId = this.addSource(citation?.url, citation?.title);
    const start = citation?.start_index;
    const end = citation?.end_index;
    if (!sourceId || !isOffset(start) || !isOffset(end) || end < start) return undefined;
    return { start: offset + start, end: offset + end, sourceIds: [sourceId] };
  }

  private openaiMessage(item: Record<string, unknown>): void {
    if (typeof item.id !== 'string') return;
    const result: AnnotatedText = { text: '', citations: [] };
    for (const value of array(item.content)) {
      const part = record(value);
      if (part?.type === 'refusal' && typeof part.refusal === 'string') {
        result.text += part.refusal;
        continue;
      }
      if (part?.type !== 'output_text' || typeof part.text !== 'string') continue;
      for (const annotation of array(part.annotations)) {
        const citation = this.openaiCitation(record(annotation), result.text.length);
        if (citation) result.citations.push(citation);
      }
      result.text += part.text;
    }
    this.openaiTexts.set(item.id, result);
  }

  private googleCandidate(candidate: Record<string, unknown>): void {
    for (const value of array(record(candidate.content)?.parts)) {
      const part = record(value);
      if (!part) continue;
      if (part.toolCall || part.toolResponse) {
        this.googleParts.push({
          before: this.googleBlocks,
          part: RuntimeJsonObjectSchema.parse(part),
          ...(this.googleBlockKind
            ? {
                offsetBefore: this.googleBlockLength,
                ...(this.googleBlockSignature
                  ? { signatureBefore: this.googleBlockSignature }
                  : {}),
              }
            : {}),
        });
        continue;
      }
      // Mirror Pi's blocks: consecutive text of one kind is one block, each call its own.
      if (part.text !== undefined) {
        const kind = part.thought === true ? 'thinking' : 'text';
        if (this.googleBlockKind !== kind) {
          this.googleBlocks++;
          this.googleBlockLength = 0;
          this.googleBlockSignature = undefined;
        }
        this.googleBlockKind = kind;
        if (typeof part.text === 'string') this.googleBlockLength += part.text.length;
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature)
          this.googleBlockSignature = part.thoughtSignature;
      }
      if (part.functionCall) {
        this.googleBlocks++;
        this.googleBlockKind = undefined;
      }
    }
    const metadata = record(candidate.groundingMetadata);
    if (metadata) {
      const sourceIds = array(metadata.groundingChunks).map((chunk) => {
        const web = record(record(chunk)?.web);
        return this.addSource(web?.uri, web?.title);
      });
      for (const value of array(metadata.groundingSupports)) {
        const support = record(value);
        const segment = record(support?.segment);
        const end = segment?.endIndex;
        if (!isOffset(end)) continue;
        const ids = array(support?.groundingChunkIndices).flatMap((index) => {
          const id = typeof index === 'number' ? sourceIds[index] : undefined;
          return id ? [id] : [];
        });
        if (!ids.length) continue;
        this.googleSupports.push({
          start: isOffset(segment?.startIndex) ? segment.startIndex : 0,
          end,
          sourceIds: ids,
          ...(typeof segment?.text === 'string' ? { text: segment.text } : {}),
        });
      }
      const html = record(metadata.searchEntryPoint)?.renderedContent;
      if (typeof html === 'string' && html.length <= 100_000) this.googleSearchSuggestions = html;
    }
    for (const value of array(record(candidate.urlContextMetadata)?.urlMetadata)) {
      const url = record(value);
      if (url?.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS')
        this.addSource(url.retrievedUrl, undefined);
      else if (url?.urlRetrievalStatus) this.failed = true;
    }
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSearchCall(item: Record<string, unknown> | undefined): item is Record<string, unknown> {
  return item?.type === 'web_search_call' || item?.type === 'x_search_call';
}
function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Gemini segment indices count UTF-8 bytes, not JavaScript UTF-16 code units. */
function googleSupportEnd(text: string, support: GoogleSupport): number | undefined {
  let bytes = 0;
  let end = 0;
  let start = 0;
  for (const character of text) {
    if (bytes === support.start) start = end;
    if (bytes === support.end) break;
    const code = character.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    end += character.length;
  }
  if (bytes === support.end && (!support.text || text.slice(start, end) === support.text))
    return end;
  // Some gateways return character offsets. Match only an unambiguous quoted segment.
  if (support.text) {
    const index = text.indexOf(support.text);
    if (index >= 0 && text.indexOf(support.text, index + 1) < 0) return index + support.text.length;
  }
  return undefined;
}

function insertCitations(text: string, citations: readonly Citation[]): string {
  const byRange = new Map<string, Citation>();
  for (let citation of citations) {
    // Gateways differ on Unicode indexing. Only shift a range when the alternate
    // character offsets identify an actual citation marker, never arbitrary prose.
    if (
      citation.start < citation.end &&
      !isCitationMarker(text.slice(citation.start, citation.end))
    ) {
      const characters = [...text];
      const start = characters.slice(0, citation.start).join('').length;
      const end = characters.slice(0, citation.end).join('').length;
      if (isCitationMarker(text.slice(start, end))) citation = { ...citation, start, end };
    }
    if (citation.end > text.length) continue;
    const key = `${citation.start}-${citation.end}`;
    const existing = byRange.get(key);
    byRange.set(key, {
      ...citation,
      sourceIds: [...new Set([...(existing?.sourceIds ?? []), ...citation.sourceIds])],
    });
  }
  let previousStart = text.length;
  for (const citation of [...byRange.values()].sort((a, b) => b.end - a.end || b.start - a.start)) {
    if (citation.end > previousStart) continue;
    const marker = citation.sourceIds.map((id) => `[cite:${id}]`).join('');
    const cited = text.slice(citation.start, citation.end);
    // OpenAI annotates its citation marker. Preserve prose if a gateway annotates the claim instead.
    const replaceMarker = isCitationMarker(cited);
    const start = replaceMarker ? citation.start : citation.end;
    text = text.slice(0, start) + marker + text.slice(citation.end);
    previousStart = citation.start;
  }
  return text;
}

function isCitationMarker(text: string): boolean {
  return /^\s*(?:cite[\s\S]*|\[[^\]]+\](?:\([^\n]*\))?)\s*$/.test(text);
}
