/**
 * Model-facing Skill tools over one turn's pinned scope.
 *
 * `search_local_skills` and `load_skill` cover automatic selection;
 * `list_skill_files` and `read_skill_file` read package-local resources
 * progressively. Every call is bounded to the scope the Host resolved: the
 * model cannot name another Agent's Skills, another revision, or a path
 * outside the package.
 */

import * as z from 'zod';

import { decodeUtf8 } from '@/backend/services/skill';
import {
  SKILL_ACTIVE_MAX_CHARACTERS,
  SKILL_INSTRUCTIONS_MAX_CHARACTERS,
} from '@/shared/data/types/skill';

import type { SkillTurnEntry, SkillTurnScope } from '../../host/skillScope';
import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import {
  lineWindow,
  READ_FILE_DEFAULT_LINE_LIMIT,
  READ_FILE_MAX_LINE_LIMIT,
} from '../readFileTool';
import { toRuntimeInputSchema } from '../runtimeToolSchema';

export const SEARCH_LOCAL_SKILLS_TOOL_NAME = 'search_local_skills';
export const LOAD_SKILL_TOOL_NAME = 'load_skill';
export const LIST_SKILL_FILES_TOOL_NAME = 'list_skill_files';
export const READ_SKILL_FILE_TOOL_NAME = 'read_skill_file';
export const SKILL_TOOL_NAMES: readonly string[] = [
  SEARCH_LOCAL_SKILLS_TOOL_NAME,
  LOAD_SKILL_TOOL_NAME,
  LIST_SKILL_FILES_TOOL_NAME,
  READ_SKILL_FILE_TOOL_NAME,
];

export const SKILL_SEARCH_PAGE_SIZE = 20;
const SKILL_FILE_MAX_BYTES = 1_048_576;

const searchInputSchema = z.strictObject({
  query: z
    .string()
    .max(200)
    .describe(
      'Words to match against Skill names and descriptions. Empty lists every available Skill.',
    ),
  cursor: z
    .string()
    .optional()
    .describe('Continue a previous search from its returned nextCursor.'),
});
const skillIdSchema = z
  .string()
  .min(1)
  .describe('skill_id from the Skills catalog or search_local_skills.');
const loadInputSchema = z.strictObject({ skill_id: skillIdSchema });
const listFilesInputSchema = z.strictObject({
  skill_id: skillIdSchema,
  prefix: z
    .string()
    .max(256)
    .optional()
    .describe('Only paths starting with this package-relative prefix.'),
});
const readFileInputSchema = z.strictObject({
  skill_id: skillIdSchema,
  path: z
    .string()
    .min(1)
    .max(512)
    .describe('Package-relative path from list_skill_files or the Skill instructions.'),
  start_line: z.int().min(1).optional().describe('One-based line to start from. Defaults to 1.'),
  limit: z
    .int()
    .min(1)
    .max(READ_FILE_MAX_LINE_LIMIT)
    .optional()
    .describe(`Maximum lines to return. Defaults to ${READ_FILE_DEFAULT_LINE_LIMIT}.`),
});

export function createSkillTools(
  scope: SkillTurnScope,
  options: {
    loadedSkillIds?: readonly string[];
    explicitSkillIds?: readonly string[];
    instructionCharacters?: number;
    onLoad?: (entry: SkillTurnEntry, instructions: string) => void;
  } = {},
): RuntimeTool[] {
  const loaded = new Set(options.loadedSkillIds);
  const explicit = new Set(options.explicitSkillIds);
  let instructionCharacters = options.instructionCharacters ?? 0;
  const loading = new Map<string, Promise<RuntimeToolResult>>();

  function resolve(skillId: string): SkillTurnEntry | RuntimeToolResult {
    const entry = scope.entries.find((entry) => entry.id === skillId);
    return entry && (entry.invocation.modelInvocable || loaded.has(skillId))
      ? entry
      : invalid('This Skill is not available to this Agent in this conversation.');
  }

  return [
    {
      ref: { source: 'builtin', capabilityId: SEARCH_LOCAL_SKILLS_TOOL_NAME },
      providerName: SEARCH_LOCAL_SKILLS_TOOL_NAME,
      displayName: 'Search Skills',
      description:
        'Search the Skills available to this Agent by name and description. Returns metadata only; call load_skill with a returned skill_id to read its instructions. Results never include Skills outside this Agent.',
      inputSchema: toRuntimeInputSchema(searchInputSchema),
      inputPreview: { textField: 'query' },
      approval: 'auto',
      async execute({ input }) {
        const parsed = searchInputSchema.safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const terms = parsed.data.query.toLowerCase().split(/\s+/).filter(Boolean);
        const modelInvocable = scope.entries.filter((entry) => entry.invocation.modelInvocable);
        const matched = modelInvocable.filter((entry) => {
          if (terms.length === 0) return true;
          const haystack = `${entry.name} ${entry.description}`.toLowerCase();
          return terms.some((term) => haystack.includes(term));
        });
        const offset = parseCursor(parsed.data.cursor);
        const page = matched.slice(offset, offset + SKILL_SEARCH_PAGE_SIZE);
        const next = offset + page.length;
        return {
          value: {
            total: modelInvocable.length,
            matched: matched.length,
            returned: page.length,
            skills: page.map(summarize),
            nextCursor: next < matched.length ? String(next) : null,
          },
          artifacts: [],
        };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: LOAD_SKILL_TOOL_NAME },
      providerName: LOAD_SKILL_TOOL_NAME,
      displayName: 'Load Skill',
      description:
        'Load the full instructions of one available Skill. Do this once per Skill when the task matches its description, then follow the instructions with the tools available in this conversation. Loading grants no tools or permissions.',
      inputSchema: toRuntimeInputSchema(loadInputSchema),
      approval: 'auto',
      async execute({ input, signal }) {
        const parsed = loadInputSchema.safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const entry = resolve(parsed.data.skill_id);
        if (!('id' in entry)) return entry;
        signal.throwIfAborted();
        const receipt = {
          status: 'ok',
          ...summarize(entry),
          revision: entry.packageDigest.slice(0, 12),
          activation: {
            skillId: entry.id,
            name: entry.name,
            packageDigest: entry.packageDigest,
            origin: explicit.has(entry.id) ? 'explicit' : 'automatic',
          },
        };
        if (loaded.has(entry.id))
          return { value: { ...receipt, alreadyLoaded: true }, artifacts: [] };
        const pending = loading.get(entry.id);
        if (pending) return pending;
        const load = (async (): Promise<RuntimeToolResult> => {
          const instructions = await scope.readInstructions(entry.id);
          signal.throwIfAborted();
          if (instructions === null) return invalid('The Skill package could not be read.');
          const length = [...instructions].length;
          if (
            length > SKILL_INSTRUCTIONS_MAX_CHARACTERS ||
            instructionCharacters + length > SKILL_ACTIVE_MAX_CHARACTERS
          )
            return invalid(
              'The active Skill instruction budget is full. Continue with the already loaded Skills.',
            );
          instructionCharacters += length;
          loaded.add(entry.id);
          options.onLoad?.(entry, instructions);
          return {
            value: {
              ...receipt,
              alreadyLoaded: false,
              files: entry.files.filter((path) => path !== 'SKILL.md'),
            },
            artifacts: [],
          };
        })();
        loading.set(entry.id, load);
        try {
          return await load;
        } finally {
          loading.delete(entry.id);
        }
      },
    },
    {
      ref: { source: 'builtin', capabilityId: LIST_SKILL_FILES_TOOL_NAME },
      providerName: LIST_SKILL_FILES_TOOL_NAME,
      displayName: 'List Skill files',
      description:
        'List the package-local files of an available Skill, such as references or templates. Read them with read_skill_file.',
      inputSchema: toRuntimeInputSchema(listFilesInputSchema),
      approval: 'auto',
      async execute({ input }) {
        const parsed = listFilesInputSchema.safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const entry = resolve(parsed.data.skill_id);
        if (!('id' in entry)) return entry;
        if (!loaded.has(entry.id)) return invalid('Load this Skill before reading its resources.');
        const prefix = parsed.data.prefix ?? '';
        const files = entry.files.filter((path) => path.startsWith(prefix));
        return { value: { skill_id: entry.id, name: entry.name, files }, artifacts: [] };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: READ_SKILL_FILE_TOOL_NAME },
      providerName: READ_SKILL_FILE_TOOL_NAME,
      displayName: 'Read Skill file',
      description:
        'Read a text file inside an available Skill package as a bounded line window. Binary files return metadata only. Lines start at 1; when truncated, continue from startLine + lineCount.',
      inputSchema: toRuntimeInputSchema(readFileInputSchema),
      approval: 'auto',
      async execute({ input, signal }): Promise<RuntimeToolResult> {
        const parsed = readFileInputSchema.safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const entry = resolve(parsed.data.skill_id);
        if (!('id' in entry)) return entry;
        if (!loaded.has(entry.id)) return invalid('Load this Skill before reading its resources.');
        const { path, start_line = 1, limit = READ_FILE_DEFAULT_LINE_LIMIT } = parsed.data;
        if (!entry.files.includes(path))
          return invalid('The file is not part of this Skill package.');
        signal.throwIfAborted();
        const bytes = await scope.readFile(entry.id, path);
        if (!bytes) return invalid('The Skill file could not be read.');
        if (bytes.byteLength > SKILL_FILE_MAX_BYTES) {
          return {
            value: {
              status: 'error',
              message: 'The file exceeds the readable size limit.',
              path,
              size: bytes.byteLength,
            },
            artifacts: [],
          };
        }
        const text = decodeUtf8(bytes);
        if (text === null) {
          return {
            value: {
              status: 'binary',
              path,
              size: bytes.byteLength,
              message: 'Binary resource; this tool returns metadata only.',
            },
            artifacts: [],
          };
        }
        const window = lineWindow(text, start_line, limit);
        return {
          value: {
            status: 'ok',
            skill_id: entry.id,
            path,
            size: bytes.byteLength,
            startLine: start_line,
            lineCount: window.lineCount,
            totalLines: window.totalLines,
            truncated: window.truncated,
            ...(window.lineTruncated ? { lineTruncated: true } : {}),
            text: window.text,
          },
          artifacts: [],
        };
      },
    },
  ];
}

function summarize(entry: SkillTurnEntry) {
  return {
    skill_id: entry.id,
    name: entry.name,
    description: entry.description,
    verified: entry.admission.status === 'ready',
  };
}

function parseCursor(cursor: string | undefined): number {
  const value = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
