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

/** Cherry metadata on a ToolUIPart / DynamicToolUIPart. */
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
});

// Table-driven dispatch — part `type` → schema. First match wins.
const SCHEMA_BY_PART_TYPE: ReadonlyArray<readonly [(t: string) => boolean, z.ZodTypeAny]> = [
  [(t) => t === 'text', CherryTextMetaSchema],
  [(t) => t === 'reasoning', CherryReasoningMetaSchema],
  [(t) => t === 'dynamic-tool' || t.startsWith('tool-'), CherryToolMetaSchema],
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
