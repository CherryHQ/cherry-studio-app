/**
 * Model-facing Skill tools over one turn's pinned scope.
 *
 * `list_local_skills` and `load_skill` cover automatic selection;
 * `list_skill_files` and `read_skill_file` read package-local resources
 * progressively. Every call is bounded to the scope the Host resolved: the
 * model cannot name another Agent's Skills, another revision, or a path
 * outside the package.
 */

import * as z from 'zod';

import { decodeUtf8 } from '@/backend/services/skill';
import {
  SKILL_ACTIVE_MAX_CHARACTERS,
  SKILL_ACTIVE_MAX_ENTRIES,
  SKILL_INSTRUCTIONS_MAX_CHARACTERS,
  skillContentHashHex,
} from '@/shared/data/types/skill';

import { skillInstructionSection } from '../../host/skillInstructions';
import type { SkillTurnEntry, SkillTurnScope } from '../../host/skillScope';
import type { RuntimeTool, RuntimeToolResult } from '../../runtime';
import {
  lineWindow,
  READ_FILE_DEFAULT_LINE_LIMIT,
  READ_FILE_MAX_LINE_LIMIT,
} from '../readFileTool';
import { toRuntimeInputSchema } from '../runtimeToolSchema';
import { createSkillAdaptationTool, type SkillAdaptationToolOptions } from './skillAdaptationTool';

export const LIST_LOCAL_SKILLS_TOOL_NAME = 'list_local_skills';
export const LOAD_SKILL_TOOL_NAME = 'load_skill';
export const LIST_SKILL_FILES_TOOL_NAME = 'list_skill_files';
export const READ_SKILL_FILE_TOOL_NAME = 'read_skill_file';

export const SKILL_LIST_PAGE_SIZE = 20;
const SKILL_FILE_MAX_BYTES = 1_048_576;

const listInputSchema = z.strictObject({
  include_manual: z
    .boolean()
    .optional()
    .describe(
      'Include manual-only metadata when the user asks for their complete Skill count or list. Defaults to false for automatic discovery; does not authorize loading manual-only instructions.',
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      'Continue the same inventory with its returned nextCursor and include_manual option.',
    ),
});
const skillIdSchema = z
  .string()
  .min(1)
  .describe('skill_id from the Skills catalog or list_local_skills.');
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
    /** Skills whose instructions the system prompt already carries this turn. */
    loadedSkillIds?: readonly string[];
    explicitSkillIds?: readonly string[];
    instructionCharacters?: number;
    instructionLengths?: ReadonlyMap<string, number>;
    adaptation?: SkillAdaptationToolOptions;
  } = {},
): RuntimeTool[] {
  const loaded = new Set(options.loadedSkillIds);
  const explicit = new Set(options.explicitSkillIds);
  let instructionCharacters = options.instructionCharacters ?? 0;
  const lengths = new Map(options.instructionLengths);
  const loading = new Map<string, Promise<RuntimeToolResult>>();

  function canReplace(id: string, length: number) {
    return (
      length <= SKILL_INSTRUCTIONS_MAX_CHARACTERS &&
      instructionCharacters - (lengths.get(id) ?? 0) + length <= SKILL_ACTIVE_MAX_CHARACTERS
    );
  }

  function activate(entry: SkillTurnEntry, instructions: string): RuntimeToolResult {
    const length = [...instructions].length;
    instructionCharacters += length - (lengths.get(entry.id) ?? 0);
    lengths.set(entry.id, length);
    loaded.add(entry.id);
    return {
      value: null,
      instructions: skillInstructionSection(entry, instructions),
      artifacts: [],
    };
  }

  function resolve(skillId: string): SkillTurnEntry | RuntimeToolResult {
    const entry = scope.entries.find((entry) => entry.id === skillId);
    return entry && (entry.invocation.modelInvocable || loaded.has(skillId))
      ? entry
      : invalid('This Skill is not available to this Agent in this conversation.');
  }

  const tools: RuntimeTool[] = [
    {
      ref: { source: 'builtin', capabilityId: LIST_LOCAL_SKILLS_TOOL_NAME },
      providerName: LIST_LOCAL_SKILLS_TOOL_NAME,
      displayName: 'List Skills',
      description:
        "List names, IDs and complete descriptions of Skills enabled for this Agent, without keyword filtering. Compare their meanings with the user's task, including across languages, then call load_skill for a suitable Skill. Follow nextCursor with the same include_manual option until null before concluding that none fits or reporting a complete list. Automatic discovery excludes manual-only packages. For the user's complete inventory, use include_manual: true. total is the requested inventory count, automaticTotal is its automatically invocable subset, and returned is this page size. Unbound, disabled and unreadable packages are excluded. Metadata grants no permission to load manual-only instructions.",
      inputSchema: toRuntimeInputSchema(listInputSchema),
      approval: 'auto',
      async execute({ input }) {
        const parsed = listInputSchema.safeParse(input);
        if (!parsed.success) return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
        const modelInvocable = scope.entries.filter((entry) => entry.invocation.modelInvocable);
        const available = parsed.data.include_manual ? scope.entries : modelInvocable;
        const offset = parseCursor(parsed.data.cursor);
        const page = available.slice(offset, offset + SKILL_LIST_PAGE_SIZE);
        const next = offset + page.length;
        return {
          value: {
            total: available.length,
            automaticTotal: modelInvocable.length,
            returned: page.length,
            skills: page.map(summarize),
            nextCursor: next < available.length ? String(next) : null,
          },
          artifacts: [],
        };
      },
    },
    {
      ref: { source: 'builtin', capabilityId: LOAD_SKILL_TOOL_NAME },
      providerName: LOAD_SKILL_TOOL_NAME,
      displayName: 'Read Skill',
      description:
        'Read the full SKILL.md instructions of one available Skill from the app-managed library. The app supplies the complete body in the system context; the tool reply is a receipt with resource paths. Call this built-in function directly, without MCP tool search or a filesystem path. Read when the task matches its description and its instructions are not already active or explicitly selected, then follow them. Repeat only to recover missing instructions, without consuming additional active instruction budget. Reading grants no tools or permissions.',
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
          revision: skillContentHashHex(entry.contentHash).slice(0, 12),
          activation: {
            skillId: entry.id,
            name: entry.name,
            contentHash: entry.contentHash,
            origin: explicit.has(entry.id) ? 'explicit' : 'automatic',
          },
        };
        const pending = loading.get(entry.id);
        if (pending) return pending;
        const load = (async (): Promise<RuntimeToolResult> => {
          const instructions = await scope.readInstructions(entry.id);
          signal.throwIfAborted();
          if (
            scope.entries.find((current) => current.id === entry.id)?.contentHash !==
            entry.contentHash
          )
            return invalid(
              'The local Skill changed while reading. Read its current instructions again.',
            );
          if (instructions === null) return invalid('The Skill package could not be read.');
          const length = [...instructions].length;
          const alreadyLoaded = loaded.has(entry.id);
          if (
            length > SKILL_INSTRUCTIONS_MAX_CHARACTERS ||
            (!alreadyLoaded &&
              (loaded.size >= SKILL_ACTIVE_MAX_ENTRIES ||
                instructionCharacters + length > SKILL_ACTIVE_MAX_CHARACTERS))
          )
            return invalid(
              'The active Skill instruction budget is full. Continue with the already loaded Skills.',
            );
          if (!alreadyLoaded) instructionCharacters += length;
          lengths.set(entry.id, length);
          loaded.add(entry.id);
          return {
            value: {
              ...receipt,
              alreadyLoaded,
              files: entry.files.filter((path) => path !== 'SKILL.md'),
              instructionsInSystem: true,
            },
            instructions: skillInstructionSection(entry, instructions),
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
            ...(window.nextOffset !== undefined ? { lineTruncated: true } : {}),
            text: window.text,
          },
          artifacts: [],
        };
      },
    },
  ];
  if (options.adaptation)
    tools.push(
      createSkillAdaptationTool(scope, {
        ...options.adaptation,
        isLoaded: (id) => loaded.has(id),
        canReplace,
        activate,
      }),
    );
  return tools;
}

function summarize(entry: SkillTurnEntry) {
  return {
    skill_id: entry.id,
    name: entry.name,
    description: entry.description,
    invocation: entry.invocation,
  };
}

function parseCursor(cursor: string | undefined): number {
  const value = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
