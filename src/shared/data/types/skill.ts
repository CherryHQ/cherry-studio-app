/**
 * Skill vocabulary shared by the Data API, the Skills workflow module, the
 * Agent Host, and the UI (docs/references/agent/agent-skills.md).
 *
 * A Skill is an installed `SKILL.md` package. Package validity, the app
 * limitations of its profile, installation, global enablement, Agent binding,
 * and per-turn eligibility are distinct facts with distinct lifetimes.
 */

import * as z from 'zod';

import { AgentIdSchema } from './agent';

export const SkillIdSchema = z.uuidv4();
export type SkillId = z.infer<typeof SkillIdSchema>;

export const SKILL_INSTRUCTIONS_MAX_CHARACTERS = 24_000;
export const SKILL_ACTIVE_MAX_CHARACTERS = 48_000;
export const SKILL_ACTIVE_MAX_ENTRIES = 64;

export const SkillActionSchema = z.enum(['find-and-install', 'create']);
export type SkillAction = z.infer<typeof SkillActionSchema>;

/** App-issued receipt, never accepted from a model or submit-message input. */
export const SkillActivationSchema = z.strictObject({
  skillId: SkillIdSchema,
  name: z.string().min(1),
  contentHash: z.string().min(1),
  origin: z.enum(['automatic', 'explicit']),
});
export type SkillActivation = z.infer<typeof SkillActivationSchema>;

/** Composer display snapshots only; offsets use UTF-16 and grant no Skill access. */
export const SkillTextReferenceSchema = z.union([
  z.strictObject({
    type: z.literal('skill'),
    skillId: SkillIdSchema,
    label: z.string().min(1),
    offset: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('skill-action'),
    action: SkillActionSchema,
    label: z.string().min(1),
    offset: z.number().int().nonnegative(),
  }),
]);
export type SkillTextReference = z.infer<typeof SkillTextReferenceSchema>;

/** Agent Skills specification `name`: lowercase, digits, single hyphens, at most 64 characters. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_COMPATIBILITY_MAX_LENGTH = 500;
export const SKILL_ENTRY_FILENAME = 'SKILL.md';

export const SkillNameSchema = z
  .string()
  .min(1)
  .max(SKILL_NAME_MAX_LENGTH)
  .regex(SKILL_NAME_PATTERN);

/** Desktop `content_hash` format: a versioned SHA-256 over the whole package directory. */
export const SKILL_CONTENT_HASH_PREFIX = 'directory-sha256:';

/** The hexadecimal digest, used for revision directory names and short display. */
export function skillContentHashHex(contentHash: string): string {
  return contentHash.startsWith(SKILL_CONTENT_HASH_PREFIX)
    ? contentHash.slice(SKILL_CONTENT_HASH_PREFIX.length)
    : contentHash;
}

/**
 * Existing persisted source vocabulary. `marketplace` is the user library;
 * packages created in chat have no upstream URL. `builtin` is legacy backup data.
 */
export const SkillSourceKindSchema = z.enum(['builtin', 'marketplace']);
export type SkillSourceKind = z.infer<typeof SkillSourceKindSchema>;

export const CHERRY_SKILL_COMPATIBILITY =
  'Designed for Cherry Studio App in standard mode with a model that supports tool calling.';

/** Authoring data, never an instruction activation or a grant of tools. */
export const CreateSkillInputSchema = z.strictObject({
  name: SkillNameSchema,
  description: z.string().trim().min(1).max(SKILL_DESCRIPTION_MAX_LENGTH),
  compatibility: z
    .string()
    .trim()
    .min(1)
    .max(SKILL_COMPATIBILITY_MAX_LENGTH - CHERRY_SKILL_COMPATIBILITY.length - 1)
    .optional()
    .describe(
      'Additional environment requirements, such as iOS, configured providers or connected plugins. The app adds the Cherry Studio App requirement.',
    ),
  allowedTools: z
    .array(z.string().regex(/^[\w.:-]{1,64}$/))
    .max(64)
    .optional()
    .describe(
      'Exact model-facing tool names used by the workflow, selected from tools actually offered or discovered in this turn. Omit for a text-only Skill. Never list internal capability aliases or invent tools.',
    ),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[^\s,]+$/),
    )
    .max(16)
    .optional()
    .describe(
      'Concise topic tags, without spaces or commas. Include only tags useful for this Skill.',
    ),
  license: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .optional()
    .describe(
      'License supplied or explicitly chosen by the user. Omit when unspecified; do not invent a license.',
    ),
  instructions: z
    .string()
    .trim()
    .min(1)
    .max(SKILL_INSTRUCTIONS_MAX_CHARACTERS * 2)
    .refine((text) => [...text].length <= SKILL_INSTRUCTIONS_MAX_CHARACTERS, {
      message: 'Skill instructions exceed the character limit.',
    }),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInputSchema>;

export const SkillSourceRegistrySchema = z.enum(['bundled', 'github', 'cherryin']);
export type SkillSourceRegistry = z.infer<typeof SkillSourceRegistrySchema>;

/**
 * Where a discovered candidate comes from. `locator` is its origin identity
 * (`bundled:<name>`, `github:<owner>/<repo>/<skill root>`, or a CherryIN package entry); an installed
 * Skill derives the same identity from its source and URL.
 */
export const SkillSourceSchema = z.strictObject({
  registry: SkillSourceRegistrySchema,
  locator: z.string().min(1),
  url: z.string().nullable(),
  /** The exact upstream revision the candidate is pinned to. */
  revision: z.string().min(1),
});
export type SkillSource = z.infer<typeof SkillSourceSchema>;

/**
 * What an accepted package asks of its host that its manifest does not already
 * record, read once from its bytes at installation and stored with the
 * installation. These are facts about the package, never about the user's
 * configuration.
 */
export const SkillProfileSchema = z.strictObject({
  /** Tool names from the `allowed-tools` frontmatter, without their argument patterns. */
  declaredTools: z.array(z.string().min(1)),
});
export type SkillProfile = z.infer<typeof SkillProfileSchema>;

export const EMPTY_SKILL_PROFILE: SkillProfile = { declaredTools: [] };

/**
 * The part of a package this app does not provide at all. Missing permissions,
 * providers and plugin connections are the user's configuration and never appear.
 */
export const SkillLimitationsSchema = z.strictObject({
  /** Package-relative paths of script files; the app has no interpreter for them. */
  scripts: z.array(z.string().min(1)),
  /** Declared tools the app has no counterpart for. */
  unavailableTools: z.array(z.string().min(1)),
});
export type SkillLimitations = z.infer<typeof SkillLimitationsSchema>;

export const SkillManifestEntrySchema = z.strictObject({
  /** Package-relative POSIX path; never absolute. */
  path: z.string().min(1),
  size: z.int().nonnegative(),
  digest: z.string().min(1),
});
export type SkillManifestEntry = z.infer<typeof SkillManifestEntrySchema>;

/** Model-invocation policy from `SKILL.md` frontmatter. Both default to true. */
export const SkillInvocationSchema = z.strictObject({
  /** False when `disable-model-invocation: true`; the model cannot select it automatically. */
  modelInvocable: z.boolean(),
  /** False when `user-invocable: false`; the composer cannot select it explicitly. */
  userInvocable: z.boolean(),
});
export type SkillInvocation = z.infer<typeof SkillInvocationSchema>;

/** One installed library entry (`agent_global_skill`), field-aligned with desktop. */
export const SkillSchema = z.strictObject({
  id: SkillIdSchema,
  name: SkillNameSchema,
  description: z.string().max(SKILL_DESCRIPTION_MAX_LENGTH),
  /** Storage directory name, equal to the package name and unique like desktop. */
  folderName: z.string().min(1),
  source: SkillSourceKindSchema,
  /** URL the package is re-resolved from for updates; null when there is no upstream source. */
  sourceUrl: z.string().nullable(),
  author: z.string().nullable(),
  version: z.string().nullable(),
  tags: z.array(z.string().min(1)),
  contentHash: z.string().min(1),
  manifest: z.array(SkillManifestEntrySchema),
  profile: SkillProfileSchema,
  invocation: SkillInvocationSchema,
  /** Global enablement; Agent enablement lives on the binding. */
  isEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** One Agent's use of an installed Skill (`agent_skill`). */
export const AgentSkillBindingSchema = z.strictObject({
  agentId: AgentIdSchema,
  skillId: SkillIdSchema,
  isEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgentSkillBinding = z.infer<typeof AgentSkillBindingSchema>;

/**
 * Library projection: the installed record, whether its accepted bytes are
 * still on disk, its app limitations, and, when read for an Agent, that
 * Agent's binding.
 */
export const SkillListItemSchema = SkillSchema.extend({
  isPackageMissing: z.boolean(),
  limitations: SkillLimitationsSchema,
  /** Present only when the list was read for one Agent. */
  binding: AgentSkillBindingSchema.pick({ isEnabled: true }).nullable().optional(),
});
export type SkillListItem = z.infer<typeof SkillListItemSchema>;

/** A discovered package that is not installed. `candidateId` is an opaque installation handle. */
export const SkillCandidateSchema = z.strictObject({
  candidateId: z.string().min(1),
  name: SkillNameSchema,
  description: z.string().min(1),
  source: SkillSourceSchema,
  author: z.string().nullable(),
  version: z.string().nullable(),
  tags: z.array(z.string().min(1)),
  /** The already-installed Skill for this locator, when any. */
  installedSkillId: SkillIdSchema.nullable(),
});
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;

/** Package validation failure codes; these are not compatibility outcomes. */
export const SkillPackageIssueCodeSchema = z.enum([
  'entry-missing',
  'frontmatter-missing',
  'frontmatter-invalid',
  'name-invalid',
  'name-mismatch',
  'description-invalid',
  'compatibility-too-long',
  'path-unsafe',
  'path-collision',
  'package-too-large',
  'too-many-files',
  'file-too-large',
  'unsupported-semantics',
]);
export type SkillPackageIssueCode = z.infer<typeof SkillPackageIssueCodeSchema>;

export const SkillPackageIssueSchema = z.strictObject({
  code: SkillPackageIssueCodeSchema,
  subject: z.string().nullable(),
});
export type SkillPackageIssue = z.infer<typeof SkillPackageIssueSchema>;
