import { isHttpUrl } from '@shared/utils/url';
import * as z from 'zod';

/**
 * Wire contracts for builtin agent tools.
 *
 * Single source of truth for input/output shapes the model sees and the
 * renderer renders, so a shape change in one place is a compile error in the
 * other.
 */

// ── web_search ───────────────────────────────────────────────────

export const WEB_SEARCH_TOOL_NAME = 'web_search';
export const WEB_FETCH_TOOL_NAME = 'web_fetch';

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, 'Query must be at least 2 characters')
    .max(200, 'Query should be concise — break long questions into multiple searches')
    .describe(
      'Self-contained web search query. MUST NOT use pronouns ("it", "their") or context-dependent ' +
        'references; expand the topic from earlier messages when the user asks a follow-up. ' +
        'Examples: ✓ "Anthropic Claude 4.5 release date", ✗ "when did it ship".',
    ),
});

export const webSearchOutputItemSchema = z.object({
  // Citation id the model echoes back as `[cite:id]`. New results use a per-call
  // random-prefixed string ("3f2a1b9c-2") so ids stay unique across multiple lookup
  // calls in one message; number is kept so older persisted results still parse.
  id: z.union([z.string(), z.number().int().positive()]),
  title: z.string(),
  url: z.string(),
  content: z.string(),
});

export const webSearchOutputSchema = z.array(webSearchOutputItemSchema);

export const webFetchInputSchema = z.object({
  // `.refine()` rather than `.url()`: WebFetchTool runs with `strict: true`, and `.url()` emits
  // `format: "uri"`, which strict OpenAI-compatible providers reject outright — the whole request
  // 400s ("Invalid schema for function 'web_fetch': ... 'uri' is not a valid format"), taking every
  // other tool in the turn down with it. A refinement is invisible to `toJSONSchema` (no `format`
  // keyword) yet still runs locally, so the model's tool call is validated before `execute` and a
  // malformed URL surfaces as a repairable input error instead of a bogus network failure.
  //
  // `isHttpUrl` is literally the predicate `normalizeWebSearchUrls` enforces service-side, so the
  // schema and the service agree by construction instead of via two copies of one rule that drift.
  //
  // It is only a syntax gate, though. Of the two providers serving `web_fetch`, `fetch` retrieves
  // the target in this process and so runs it through `remoteUrlSafety`, which additionally rejects
  // credentials and loopback/private hosts that `isHttpUrl` accepts; `jina` hands the target to
  // r.jina.ai and never retrieves it here. Passing this schema therefore does not imply a URL is
  // safe or fetchable.
  urls: z
    .array(z.string().trim().min(1).refine(isHttpUrl, 'must be an absolute http(s) URL'))
    .min(1)
    .max(20, 'Fetch at most 20 URLs per call')
    .describe(
      'Absolute http(s) web page URLs to fetch and summarize. Use web_search first when you do not know the URL.',
    ),
});

export const webFetchOutputSchema = webSearchOutputSchema;

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;
export type WebSearchOutputItem = z.infer<typeof webSearchOutputItemSchema>;
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;
export type WebFetchInput = z.infer<typeof webFetchInputSchema>;
export type WebFetchOutput = z.infer<typeof webFetchOutputSchema>;

// ── report_artifacts ─────────────────────────────────────────────

export const REPORT_ARTIFACTS_TOOL_NAME = 'report_artifacts';

export const reportArtifactsInputSchema = z.object({
  artifacts: z
    .array(
      z.object({
        path: z
          .string()
          .trim()
          .min(1)
          .describe('Absolute or workspace-relative path to a final deliverable file.'),
        description: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('One-line description of what this file is.'),
      }),
    )
    .min(1)
    .describe(
      'The final deliverable file(s) produced for the user. List only finished outputs — never ' +
        'intermediate, scratch, or temporary files.',
    ),
  summary: z.string().trim().min(1).optional().describe('One-line summary of what was produced.'),
});

export const REPORT_ARTIFACTS_DESCRIPTION =
  'Declare the final deliverable file(s) produced for the user. Call this once, at the end of the task, ' +
  'after the requested file(s) are finished — pass the final path(s) and an optional one-line summary. ' +
  'List only final deliverables; omit intermediate, scratch, or temporary files. Skip the call entirely ' +
  'if the task produced no files.';

export type ReportArtifactsInput = z.infer<typeof reportArtifactsInputSchema>;

// ── generate_image ───────────────────────────────────────────────

export type { GenerateImageOutput, GenerateImageOutputItem } from './generateImageTool';
export {
  GENERATE_IMAGE_TOOL_NAME,
  generateImageOutputItemSchema,
  generateImageOutputSchema,
} from './generateImageTool';

// ── agent autonomy tools (cron / notify / config) ────────────────
// Hosted by the same in-process `cherry-tools` MCP server as the tools above. Their input schemas
// are plain JSON Schema `Tool` definitions in `src/main/ai/mcp/servers/cherryAutonomyTools.ts`;
// only the names are shared (the approval policy references them).

export const CRON_TOOL_NAME = 'cron';
export const NOTIFY_TOOL_NAME = 'notify';
export const CONFIG_TOOL_NAME = 'config';

// ── read_file ────────────────────────────────────────────────────

export const READ_FILE_TOOL_NAME = 'read_file';

/**
 * Page size for inlined attachment text — the cap on what's inlined up front
 * and the default page size when `read_file` is called without `limit`.
 */
export const READ_FILE_PAGE_SIZE = 8000;

export const readFileInputSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Name of the attached file to read, exactly as it appears in the attachment manifest in the conversation.',
    ),
  // Required plain numbers with a 0 sentinel, not `.optional()` / `.nullable()`: ReadFileTool runs
  // with `strict: true`, so a strict OpenAI-compatible provider rejects a schema whose `required`
  // omits a property (`z.toJSONSchema` drops `.optional()` fields from `required`) — while Gemini
  // rejects the `anyOf: [number, null]` that `.nullable()` emits ("didn't specify the schema type
  // field"). A bare `number` is the only shape both accept; `readFile` maps 0 back to the defaults.
  offset: z
    .number()
    .int()
    .nonnegative()
    .describe(
      '0-based character offset to start from. Page through long documents with offset + limit. Use 0 to start at the beginning.',
    ),
  limit: z
    .number()
    .int()
    .nonnegative()
    .max(200_000)
    .describe(`Max characters to return. Use 0 to default to ${READ_FILE_PAGE_SIZE}.`),
});

export const readFileOutputSchema = z.object({
  text: z.string(),
  /** Total characters available in the extracted text (for paging). */
  totalChars: z.number().int().nonnegative(),
  /** Next `offset` to pass to continue reading, omitted when the end was reached. */
  nextOffset: z.number().int().nonnegative().optional(),
});

/** Lookup failure shape — a sanitized, filename-level message; distinguishable from a successful read. */
export const readFileErrorSchema = z.object({ error: z.string() });

/** Full `read_file` wire result: a successful (possibly paged) read, or an error. */
export const readFileResultSchema = z.union([readFileOutputSchema, readFileErrorSchema]);

export type ReadFileInput = z.infer<typeof readFileInputSchema>;
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;
export type ReadFileError = z.infer<typeof readFileErrorSchema>;
export type ReadFileResult = z.infer<typeof readFileResultSchema>;
