import * as z from 'zod';

import { AgentCapabilitySchema } from '@/shared/data/types/agentCapability';
import { UniqueModelIdSchema } from '@/shared/data/types/model';

/** Minimal Agents exclude app tools; provider-native web tools follow the web policy. */
export const AgentModeSchema = z
  .enum(['standard', 'minimal'])
  .describe(
    'standard allows configured tools and plugins; minimal supports chat, direct image understanding and available provider-native web tools, without app tools, Skills or plugins.',
  );
export type AgentMode = z.infer<typeof AgentModeSchema>;
export const DEFAULT_AGENT_MODE: AgentMode = 'standard';

/** Controls only interactive tool approval; it never grants tool availability or resource access. */
export const AgentToolApprovalModeSchema = z.enum(['default', 'auto']);
export type AgentToolApprovalMode = z.infer<typeof AgentToolApprovalModeSchema>;

export const DEFAULT_AGENT_TOOL_APPROVAL_MODE: AgentToolApprovalMode = 'auto';
export const CHERRY_AGENT_AVATAR = '🍒';

export const AgentIdSchema = z.uuidv4();

export const AgentSchema = z.strictObject({
  /** Built-in Cherry emoji or a managed avatar file reference; null uses the name fallback. */
  avatar: z.string().nullable(),
  /**
   * Read-time projection of `avatar` into a device-local image URI; null when
   * an emoji, unset, or when the file is gone. Absolute paths are never persisted — iOS
   * relocates the app container — so this is rebuilt on every read.
   */
  avatarUri: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Capability-group deny-list; a group absent from the list is enabled. */
  disabledCapabilities: z.array(AgentCapabilitySchema),
  id: AgentIdSchema,
  /** System instructions supplied to every turn */
  instructions: z.string(),
  /** Owned by the enterprise server: read-only except for the managed-Agent field allowlist. */
  isManaged: z.boolean().optional(),
  mode: AgentModeSchema,
  model: UniqueModelIdSchema.nullable(),
  /** Read-time projection of the model's display name; edits go through `model` */
  modelName: z.string().nullable(),
  name: z.string().min(1),
  orderKey: z.string(),
  toolApprovalMode: AgentToolApprovalModeSchema,
  updatedAt: z.iso.datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;

/** Fields a user may still change on an Agent the enterprise server manages. */
export const MANAGED_AGENT_EDITABLE_FIELDS = [
  'model',
  'mode',
  'toolApprovalMode',
  'disabledCapabilities',
] as const satisfies readonly (keyof Agent)[];
