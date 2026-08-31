/**
 * Cherry UI part vocabulary and per-part `providerMetadata.cherry` shapes.
 *
 * MOBILE SYNC DIVERGENCE: `CherryFileMeta` is mobile's, not desktop's. Mobile
 * file parts carry `fileEntryId` / `fileTokenSourceId` / `composerFileKind`,
 * and a managed FileUIPart's `url` holds the `cherry://file/<fileEntryId>`
 * sentinel that the file storage layer resolves at send time — desktop
 * addresses files by path and has none of this. The rest of the part
 * vocabulary still parallels desktop's uiParts.ts.
 */

import * as z from 'zod';

import type { CherryMessagePart } from './message';

export type Serializable =
  | null
  | boolean
  | number
  | string
  | Serializable[]
  | { [key: string]: Serializable };

export type SerializedError = {
  message: string | null;
  name: string | null;
  stack: string | null;
  [key: string]: Serializable;
};

export type ErrorPartData = Partial<SerializedError> & {
  code?: string;
  message?: string | null;
  name?: string | null;
  stack?: string | null;
};

export interface TranslationPartData {
  content: string;
  targetLanguage: string;
  sourceLanguage?: string;
  sourceBlockId?: string;
}

export interface VideoPartData {
  url?: string;
  filePath?: string;
}

export interface CompactPartData {
  content: string;
  compactedContent: string;
}

export interface CodePartData {
  content: string;
  language: string;
}

export type CherryDataPartTypes = {
  code: CodePartData;
  compact: CompactPartData;
  error: ErrorPartData;
  translation: TranslationPartData;
  video: VideoPartData;
};

// ============================================================================
// Cherry per-part providerMetadata.cherry shapes
//
// Mirrors the desktop split in cherry-studio-base's uiParts.ts: each UI part
// type gets its own metadata shape instead of one grab-bag interface, so
// `withCherryMeta` can reject writes that don't belong to a part's type at
// compile time.
// ============================================================================

/** Cherry metadata on a TextUIPart. */
export interface CherryTextMeta {
  /** Content references (citations, mentions). */
  references?: unknown[];
}

/** Cherry metadata on a ReasoningUIPart. */
export interface CherryReasoningMeta {
  /** Thinking duration in ms. */
  thinkingMs?: number;
  /** Thinking start timestamp in epoch ms. */
  startedAt?: number;
}

/**
 * Cherry metadata on a ToolUIPart / DynamicToolUIPart.
 *
 * Two carriers end up here. `settledByApp` is ours, written through
 * `withCherryMeta` into `providerMetadata.cherry` like every other part type.
 * `transport` / `toolName` / `tool` come from the tool *definition*'s
 * `metadata`, which the SDK copies onto the part as `toolMetadata.cherry`.
 */
export interface CherryToolMeta {
  /** Approval bridge transport. */
  transport?: string;
  /** Tool name (used by approval bridge before the part has been finalized). */
  toolName?: string;
  /** MCP / builtin tool identity. */
  tool?: {
    serverId?: string;
    serverName?: string;
    type?: 'mcp' | 'builtin' | 'provider';
  };
  /**
   * The turn ended before this tool call resolved, so the app closed the call
   * out itself. Its terminal state and reason are addressed to the model; the
   * UI reads this to avoid reporting a decision the user never made.
   */
  settledByApp?: boolean;
}

/** Cherry metadata on a FileUIPart. */
export interface CherryFileMeta {
  /** Stable identity of an internal Cherry-managed file. */
  fileEntryId?: string;
  /** Composer file token association identity. */
  fileTokenSourceId?: string;
  /** Safe composer-only source marker used to restore sent-message token previews. */
  composerFileKind?: 'pasted-text';
}

/**
 * Conditional mapping from a part's `type` literal to its cherry-meta shape.
 * Parts without a registered shape have no cherry meta — represented as `Record<string, never>`.
 */
export type CherryMetaForPartType<T extends string> = T extends 'text'
  ? CherryTextMeta
  : T extends 'reasoning'
    ? CherryReasoningMeta
    : T extends `tool-${string}` | 'dynamic-tool'
      ? CherryToolMeta
      : T extends 'file'
        ? CherryFileMeta
        : Record<string, never>;

// ============================================================================
// Zod schemas — runtime validation at the read boundary
// ============================================================================

export const CherryTextMetaSchema: z.ZodType<CherryTextMeta> = z.object({
  references: z.array(z.unknown()).optional(),
});

export const CherryReasoningMetaSchema: z.ZodType<CherryReasoningMeta> = z.object({
  thinkingMs: z.number().optional(),
  startedAt: z.number().optional(),
});

export const CherryToolMetaSchema: z.ZodType<CherryToolMeta> = z.object({
  transport: z.string().optional(),
  toolName: z.string().optional(),
  tool: z
    .object({
      serverId: z.string().optional(),
      serverName: z.string().optional(),
      type: z.enum(['mcp', 'builtin', 'provider']).optional(),
    })
    .optional(),
  settledByApp: z.boolean().optional(),
});

export const CherryFileMetaSchema: z.ZodType<CherryFileMeta> = z.object({
  fileEntryId: z.string().optional(),
  fileTokenSourceId: z.string().optional(),
  composerFileKind: z.literal('pasted-text').optional(),
});

// Table-driven dispatch — part `type` → schema. First match wins.
const SCHEMA_BY_PART_TYPE: readonly (readonly [(t: string) => boolean, z.ZodTypeAny])[] = [
  [(t) => t === 'text', CherryTextMetaSchema],
  [(t) => t === 'reasoning', CherryReasoningMetaSchema],
  [(t) => t === 'dynamic-tool' || t.startsWith('tool-'), CherryToolMetaSchema],
  [(t) => t === 'file', CherryFileMetaSchema],
];

function schemaForPartType(type: string): z.ZodTypeAny | null {
  for (const [match, schema] of SCHEMA_BY_PART_TYPE) {
    if (match(type)) return schema;
  }
  return null;
}

// ============================================================================
// Accessors — single read/write boundary for providerMetadata.cherry
// ============================================================================

/**
 * Read cherry meta with runtime validation. Returns `undefined` for missing,
 * malformed, or part types without a registered schema.
 */
export function readCherryMeta<P extends CherryMessagePart>(
  part: P,
): CherryMetaForPartType<P['type']> | undefined {
  const raw = (part as { providerMetadata?: Record<string, unknown> }).providerMetadata?.cherry;
  if (!raw || typeof raw !== 'object') return undefined;
  const schema = schemaForPartType(part.type);
  if (!schema) return undefined;
  const result = schema.safeParse(raw);
  if (!result.success) return undefined;
  return result.data as CherryMetaForPartType<P['type']>;
}

/** Read tool-definition metadata copied by the SDK onto `toolMetadata.cherry`. */
export function readCherryToolMetadata(part: CherryMessagePart): CherryToolMeta | undefined {
  const raw = (part as { toolMetadata?: Record<string, unknown> }).toolMetadata?.cherry;
  const result = CherryToolMetaSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

/**
 * Patch cherry meta with compile-time part-scoping. Writing a field that
 * doesn't belong to the part's meta shape fails to compile — e.g.
 * `withCherryMeta(textPart, { thinkingMs: 1 })` is a type error.
 */
export function withCherryMeta<P extends CherryMessagePart>(
  part: P,
  patch: Partial<CherryMetaForPartType<P['type']>>,
): P {
  const existingMeta = (part as { providerMetadata?: Record<string, unknown> }).providerMetadata;
  const existingCherry = (existingMeta?.cherry ?? {}) as Record<string, unknown>;
  return {
    ...part,
    providerMetadata: {
      ...existingMeta,
      cherry: { ...existingCherry, ...(patch as Record<string, unknown>) },
    },
  } as P;
}
