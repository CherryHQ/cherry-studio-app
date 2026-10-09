/**
 * Skill vocabulary shared by the Data API, the Skills workflow module, the
 * Agent Host, and the UI (docs/references/agent/agent-skills.md).
 *
 * A Skill is an installed `SKILL.md` package. Package validity, environment
 * admission, installation, global enablement, Agent binding, and per-turn
 * eligibility are distinct facts with distinct lifetimes; none of them is a
 * permanent "compatible" boolean.
 */

import * as z from 'zod';

import { AgentIdSchema } from './agent';
import { BUILT_IN_TOOL_CAPABILITY_IDS } from './builtInTool';
import { PluginIdSchema } from './plugin';

export const SkillIdSchema = z.uuidv4();
export type SkillId = z.infer<typeof SkillIdSchema>;

export const SKILL_INSTRUCTIONS_MAX_CHARACTERS = 24_000;
export const SKILL_ACTIVE_MAX_CHARACTERS = 48_000;

/** App-issued receipt, never accepted from a model or submit-message input. */
export const SkillActivationSchema = z.strictObject({
  skillId: SkillIdSchema,
  name: z.string().min(1),
  packageDigest: z.string().min(1),
  origin: z.enum(['automatic', 'explicit']),
});
export type SkillActivation = z.infer<typeof SkillActivationSchema>;

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

export const SkillSourceRegistrySchema = z.enum(['bundled', 'github']);
export type SkillSourceRegistry = z.infer<typeof SkillSourceRegistrySchema>;

/**
 * Where an installed package came from. `locator` is the stable origin
 * identity (`bundled:<name>` or `github:<owner>/<repo>/<skill root>`); two
 * packages with the same display name but different locators are different
 * Skills and never retarget each other.
 */
export const SkillSourceSchema = z.strictObject({
  registry: SkillSourceRegistrySchema,
  locator: z.string().min(1),
  url: z.string().nullable(),
  /** The exact upstream revision the accepted package was taken from. */
  revision: z.string().min(1),
});
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillPlatformSchema = z.enum(['android', 'ios']);
export type SkillPlatform = z.infer<typeof SkillPlatformSchema>;

/** External execution a workflow needs; Cherry Mobile implements none of them. */
export const SkillExecutionRequirementSchema = z.enum([
  'none',
  'shell',
  'python',
  'node',
  'binary',
]);
export type SkillExecutionRequirement = z.infer<typeof SkillExecutionRequirementSchema>;

/**
 * The application-owned compatibility profile. It is bound to a whole-package
 * digest, so a changed reference file invalidates it even when `SKILL.md` is
 * unchanged. Profiles describe requirements; the capability owners decide
 * whether those requirements are met right now.
 */
export const SkillRequirementsSchema = z.strictObject({
  /** `null` means every platform. */
  platforms: z.array(SkillPlatformSchema).nullable(),
  execution: SkillExecutionRequirementSchema,
  builtInTools: z.array(z.enum(BUILT_IN_TOOL_CAPABILITY_IDS)),
  pluginTools: z.array(
    z.strictObject({ pluginId: PluginIdSchema, tools: z.array(z.string().min(1)) }),
  ),
});
export type SkillRequirements = z.infer<typeof SkillRequirementsSchema>;

/**
 * `reviewed` profiles ship with the curated catalog. `analyzed` profiles are
 * derived from the package text by deterministic rules.
 */
export const SkillProfileProvenanceSchema = z.enum(['reviewed', 'analyzed']);
export type SkillProfileProvenance = z.infer<typeof SkillProfileProvenanceSchema>;

export const SkillProfileSchema = z.strictObject({
  packageDigest: z.string().min(1),
  provenance: SkillProfileProvenanceSchema,
  requirements: SkillRequirementsSchema,
  /** Human summary of the reviewed workflow scope; null for analyzed profiles. */
  workflowScope: z.string().nullable(),
});
export type SkillProfile = z.infer<typeof SkillProfileSchema>;

export const SkillAdmissionStatusSchema = z.enum(['ready', 'setup-required', 'unsupported']);
export type SkillAdmissionStatus = z.infer<typeof SkillAdmissionStatusSchema>;

export const SkillAdmissionReasonCodeSchema = z.enum([
  'platform-unsupported',
  'execution-unsupported',
  'package-unavailable',
  'capability-unavailable',
  'capability-disabled',
  'web-search-unconfigured',
  'drawing-model-unconfigured',
  'permission-denied',
  'plugin-not-connected',
  'plugin-tool-unavailable',
  'model-tool-calling-unsupported',
]);
export type SkillAdmissionReasonCode = z.infer<typeof SkillAdmissionReasonCodeSchema>;

export const SkillAdmissionReasonSchema = z.strictObject({
  code: SkillAdmissionReasonCodeSchema,
  /** Stable identifier the reason is about: a tool id, plugin id, or permission scope. */
  subject: z.string().nullable(),
});
export type SkillAdmissionReason = z.infer<typeof SkillAdmissionReasonSchema>;

/** A derived result for one scope; it is never persisted as authority. */
export const SkillAdmissionSchema = z.strictObject({
  status: SkillAdmissionStatusSchema,
  reasons: z.array(SkillAdmissionReasonSchema),
});
export type SkillAdmission = z.infer<typeof SkillAdmissionSchema>;

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

/** One installed library entry (`agent_global_skill`). */
export const SkillSchema = z.strictObject({
  id: SkillIdSchema,
  name: SkillNameSchema,
  description: z.string().min(1).max(SKILL_DESCRIPTION_MAX_LENGTH),
  /** Generated, unique storage alias; not publisher identity and not the display name. */
  folderName: z.string().min(1),
  source: SkillSourceSchema,
  author: z.string().nullable(),
  version: z.string().nullable(),
  license: z.string().nullable(),
  /** The specification's optional prose; informative only. */
  compatibility: z.string().nullable(),
  tags: z.array(z.string().min(1)),
  entryDigest: z.string().min(1),
  packageDigest: z.string().min(1),
  manifest: z.array(SkillManifestEntrySchema),
  profile: SkillProfileSchema,
  invocation: SkillInvocationSchema,
  isGlobalEnabled: z.boolean(),
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
 * Library projection: the installed record plus the current application-scope
 * admission, and, when evaluated for an Agent, that Agent's binding and scope.
 */
export const SkillListItemSchema = SkillSchema.extend({
  admission: SkillAdmissionSchema,
  /** Present only when the list was evaluated for one Agent. */
  binding: AgentSkillBindingSchema.pick({ isEnabled: true }).nullable().optional(),
  agentAdmission: SkillAdmissionSchema.optional(),
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
  /** The evidence origin known at discovery or inspection time. */
  profileProvenance: SkillProfileProvenanceSchema,
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
