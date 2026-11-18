import * as z from 'zod';

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
export const DEEPSEEK_AGENT_AVATAR = 'builtin:deepseek';

/** Emoji content only; managed file references still require the avatar image workflow. */
export const AgentEmojiAvatarSchema = z
  .string()
  .min(1)
  .max(32)
  .emoji()
  .refine((value) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value));

export const AgentIdSchema = z.uuidv4();

export const AgentSchema = z.strictObject({
  /** Emoji, bundled avatar or managed file reference. Null uses the name fallback. */
  avatar: z.string().nullable(),
  /**
   * Device-local image URI resolved from a managed file reference on each read.
   * It is null for emoji, bundled avatars, or missing files. The app container can move on iOS.
   */
  avatarUri: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Retired switches are projected as empty for existing Data API readers. */
  disabledCapabilities: z.array(z.string()).max(0),
  id: AgentIdSchema,
  /** System instructions supplied to every turn */
  instructions: z.string(),
  /** Owned by the enterprise server: read-only except for the managed-Agent field allowlist. */
  isManaged: z.boolean().optional(),
  /** A managed Agent's model pool, default first; the user picks among them only when there are several. */
  allowedModelIds: z.array(UniqueModelIdSchema).optional(),
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
