import * as z from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';

/**
 * Inference parameters for an Agent.
 *
 * Loose (passthrough) on purpose: the column is a JSON blob that outlives app
 * versions, so unknown keys written by a newer or older build must survive a
 * read-modify-write round trip instead of being silently dropped. Capability
 * toggles are deliberately absent — capabilities are tools, not agent booleans
 * (docs/references/agent/agent-persistence.md).
 */
export const AgentSettingsSchema = z.looseObject({
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/** Creation default: every parameter unset means "use the model's defaults". */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {};

/** Controls only interactive tool approval; it never grants tool availability or resource access. */
export const AgentToolApprovalModeSchema = z.enum(['default', 'auto']);
export type AgentToolApprovalMode = z.infer<typeof AgentToolApprovalModeSchema>;

export const DEFAULT_AGENT_TOOL_APPROVAL_MODE: AgentToolApprovalMode = 'default';

export const AgentIdSchema = z.uuidv4();

export const AgentSchema = z.strictObject({
  /** Stable avatar file reference; null renders the default avatar. Managed by the avatar workflow, not the CRUD DTOs. */
  avatar: z.string().nullable(),
  /**
   * Read-time projection of `avatar` into a device-local image URI; null when
   * unset or when the file is gone. Absolute paths are never persisted — iOS
   * relocates the app container — so this is rebuilt on every read.
   */
  avatarUri: z.string().nullable(),
  createdAt: z.iso.datetime(),
  id: AgentIdSchema,
  /** System instructions supplied to every turn */
  instructions: z.string(),
  modelId: UniqueModelIdSchema.nullable(),
  /** Read-time projection of the model's display name; edits go through `modelId` */
  modelName: z.string().nullable(),
  name: z.string().min(1),
  orderKey: z.string(),
  settings: AgentSettingsSchema,
  toolApprovalMode: AgentToolApprovalModeSchema,
  updatedAt: z.iso.datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;
