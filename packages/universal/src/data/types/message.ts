import type {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  TextUIPart,
  UIDataTypes,
  UIMessagePart,
  UITools,
} from 'ai';
import * as z from 'zod';

import type { CherryDataPartTypes } from './uiParts';

/** Presentation part vocabulary shared by Agent projection and message renderers. */
export type CherryMessagePart = UIMessagePart<CherryDataPartTypes, UITools>;

export type {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  TextUIPart,
  UIDataTypes,
  UIMessagePart,
  UITools,
};

export const ModelSnapshotSchema = z.strictObject({
  group: z.string().optional(),
  id: z.string(),
  name: z.string(),
  provider: z.string(),
});
export type ModelSnapshot = z.infer<typeof ModelSnapshotSchema>;

/** Model/source snapshot retained on Agent Session messages for future writes. */
export const MessageSnapshotSchema = z.strictObject({
  emoji: z.string().optional(),
  id: z.string(),
  model: ModelSnapshotSchema,
  name: z.string(),
});
export type MessageSnapshot = z.infer<typeof MessageSnapshotSchema>;

export const ContentMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ContentMessageRole = z.infer<typeof ContentMessageRoleSchema>;

export function coerceSearchRole<TRole extends string>(
  role: string,
  allowedRoles: readonly TRole[],
): TRole | undefined {
  return allowedRoles.includes(role as TRole) ? (role as TRole) : undefined;
}

export const MessageStatusSchema = z.enum(['pending', 'success', 'error', 'paused']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;
