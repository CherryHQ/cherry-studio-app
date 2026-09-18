import * as z from 'zod';

import type {
  ControllerMessage,
  ControllerPart,
  ControllerSessionSnapshot,
} from '@/shared/contracts/agent/controller';
import { filenameExtension } from '@/shared/data/types/file';
import { imageMediaTypeFromExtension, isImageFileExtension } from '@/shared/utils/imageFileTypes';

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullish() });
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  availability: z.enum(['configured', 'model-missing']),
});
export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.enum(['user', 'system']),
});
export const SessionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  workspace: WorkspaceSchema.optional(),
  createdAt: z.string().optional(),
});
const partIndex = z.number().int().nonnegative();
const TextPartSchema = z.object({
  type: z.enum(['text', 'reasoning', 'code']),
  partIndex,
  text: z.string(),
  language: z.string().optional(),
  truncated: z.boolean().default(false),
});
const PartSchema = z.union([
  TextPartSchema,
  z.object({
    type: z.literal('artifact'),
    partIndex,
    artifactIndex: z.number().int().nonnegative().optional(),
    name: z.string(),
    mediaType: z.string().optional(),
  }),
  z.object({ type: z.literal('error'), partIndex, code: z.string() }),
]);
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(PartSchema),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  truncated: z.boolean(),
  detailsAvailable: z.boolean(),
});
const InteractionSchema = z.object({
  interactionId: z.string(),
  toolName: z.string(),
  canRespond: z.boolean(),
});
export const SnapshotSchema = z.object({
  session: SessionSchema,
  processEpoch: z.string(),
  status: z.enum([
    'idle',
    'pending',
    'streaming',
    'awaiting-approval',
    'done',
    'error',
    'aborted',
    'finalizing',
  ]),
  executions: z.array(
    z.object({
      executionId: z.string(),
      messageId: z.string().optional(),
      message: MessageSchema.optional(),
    }),
  ),
  interactions: z.array(InteractionSchema),
});
export const InfoSchema = z.object({
  protocolVersion: z.literal(1),
  instanceId: z.string(),
  capabilities: z.array(z.string()),
});
export const ContentSchema = z.object({
  encoding: z.enum(['text', 'json']),
  text: z.string(),
  offset: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  revision: z.string(),
});
export const ArtifactSchema = z.object({
  encoding: z.literal('base64'),
  data: z.string(),
  name: z.string(),
  mediaType: z.string(),
  offset: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  revision: z.string(),
});
export const DetailSchema = z.object({
  partIndex,
  type: z.string(),
  name: z.string().optional(),
  state: z.string().optional(),
  fields: z.array(z.enum(['text', 'input', 'output', 'error', 'artifact', 'artifacts'])),
});
export const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        header: z.string().optional(),
        options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
        multiSelect: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(4),
});
export const ResourceSchema = z.object({
  binding: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
  partIndex,
  artifactIndex: z.number().int().nonnegative().optional(),
  field: z.enum(['text', 'input', 'output', 'error', 'artifact', 'artifacts']).optional(),
});
export type RemoteResource = z.infer<typeof ResourceSchema>;
export function resourceRef(resource: RemoteResource): string {
  return JSON.stringify(resource);
}

export function projectMessage(
  message: z.infer<typeof MessageSchema>,
  sessionId: string,
  binding: string,
  liveStatus?: ControllerSessionSnapshot['status'],
): ControllerMessage {
  const parts: ControllerPart[] = message.parts.map((part) => {
    const id = `${message.id}:${part.partIndex}`;
    if (part.type === 'artifact') {
      const extension = filenameExtension(part.name);
      return {
        id: `${id}:${part.artifactIndex ?? 0}`,
        type: 'artifact',
        name: part.name,
        // PC report_artifacts entries carry a filename but no media type.
        mediaType:
          part.mediaType ??
          (isImageFileExtension(extension) ? imageMediaTypeFromExtension(extension) : undefined),
        resource: resourceRef({
          binding,
          sessionId,
          messageId: message.id,
          partIndex: part.partIndex,
          artifactIndex: part.artifactIndex ?? 0,
        }),
      };
    }
    if (part.type === 'error') return { id, type: 'error', code: part.code };
    return {
      id,
      type: part.type,
      text: part.text,
      language: part.language,
      truncated: part.truncated,
    };
  });
  const running =
    liveStatus === 'pending' ||
    liveStatus === 'streaming' ||
    liveStatus === 'awaiting-approval' ||
    liveStatus === 'finalizing';
  return {
    id: message.id,
    role: message.role,
    parts,
    createdAt: message.createdAt,
    detailsAvailable: message.detailsAvailable,
    truncated: message.truncated,
    status: running
      ? 'streaming'
      : liveStatus === 'error' || message.status === 'error'
        ? 'error'
        : message.status === 'pending'
          ? 'pending'
          : 'success',
  };
}
export function projectSnapshot(
  value: z.infer<typeof SnapshotSchema>,
  binding: string,
): ControllerSessionSnapshot {
  return {
    current: true,
    session: value.session,
    status: value.status,
    executions: value.executions.map((entry) => ({
      id: entry.executionId,
      messageId: entry.messageId,
    })),
    liveMessages: value.executions.flatMap((entry) =>
      entry.message ? [projectMessage(entry.message, value.session.id, binding, value.status)] : [],
    ),
    interactions: value.interactions.map((entry) => ({
      id: entry.interactionId,
      toolName: entry.toolName,
      canRespond: entry.canRespond,
    })),
  };
}
