import * as z from 'zod';

import { FileEntryIdSchema } from './file';

export const DESKTOP_DISPATCH_MAX_ATTACHMENTS = 8;
export const DESKTOP_DISPATCH_MAX_TEXT_LENGTH = 32_768;

export const DesktopDispatchWorkspaceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('registered'), id: z.string().min(1), name: z.string().optional() }),
  z.object({ kind: z.literal('system') }),
]);
export type DesktopDispatchWorkspace = z.infer<typeof DesktopDispatchWorkspaceSchema>;

export const DesktopDispatchAttachmentSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  name: z.string().min(1),
  mediaType: z.string().min(1),
});
export type DesktopDispatchAttachment = z.infer<typeof DesktopDispatchAttachmentSchema>;

export const DesktopDispatchApprovalInputSchema = z.object({
  connectionId: z.string().min(1),
  connectionName: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  workspace: DesktopDispatchWorkspaceSchema,
  workspaceName: z.string().min(1),
  title: z.string().min(1),
  text: z.string(),
  textCharLength: z.number().int().nonnegative(),
  attachments: z.array(DesktopDispatchAttachmentSchema).max(DESKTOP_DISPATCH_MAX_ATTACHMENTS),
});
export type DesktopDispatchApprovalInput = z.infer<typeof DesktopDispatchApprovalInputSchema>;

export const DesktopDispatchResultSchema = z.object({
  status: z.enum(['dispatched', 'pending_confirmation', 'desktop_offline', 'rejected']),
  connectionId: z.string().min(1),
  connectionName: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  workspace: DesktopDispatchWorkspaceSchema,
  workspaceName: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  draftId: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  localSessionId: z.string().min(1).optional(),
  title: z.string().min(1),
  promptPreview: z.string(),
  attachments: z.array(DesktopDispatchAttachmentSchema).max(DESKTOP_DISPATCH_MAX_ATTACHMENTS),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type DesktopDispatchResult = z.infer<typeof DesktopDispatchResultSchema>;

export const DesktopDispatchLastTargetSchema = z.object({
  connectionId: z.string().min(1),
  agentId: z.string().min(1),
  workspace: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('registered'), id: z.string().min(1) }),
    z.object({ kind: z.literal('system') }),
  ]),
});
export type DesktopDispatchLastTarget = z.infer<typeof DesktopDispatchLastTargetSchema>;

export type DesktopDispatchSessionRef = { connectionId: string } & (
  | { sessionId: string; draftId?: never; operationId?: never }
  | { sessionId?: never; draftId: string; operationId: string }
);
