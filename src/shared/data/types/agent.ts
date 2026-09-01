import * as z from 'zod';

import { AgentCapabilitySchema } from '@/shared/data/types/agentCapability';
import { UniqueModelIdSchema } from '@/shared/data/types/model';

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
  /** Capability-group deny-list; a group absent from the list is enabled. */
  disabledCapabilities: z.array(AgentCapabilitySchema),
  id: AgentIdSchema,
  /** System instructions supplied to every turn */
  instructions: z.string(),
  modelId: UniqueModelIdSchema.nullable(),
  /** Read-time projection of the model's display name; edits go through `modelId` */
  modelName: z.string().nullable(),
  name: z.string().min(1),
  orderKey: z.string(),
  toolApprovalMode: AgentToolApprovalModeSchema,
  updatedAt: z.iso.datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;
