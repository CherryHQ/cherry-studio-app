import * as z from 'zod';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';
import { DesktopUnreachableError } from '@/backend/services/desktopConnections/remoteErrors';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import type {
  RemoteAgentModule,
  RemoteAgentSource,
  RemoteDispatchReceipt,
  RemoteMessagePart,
  RemoteMessageView,
  RemoteSessionSnapshot,
} from '@/shared/contracts/remoteAgent';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';
import {
  DESKTOP_DISPATCH_MAX_ATTACHMENTS,
  DESKTOP_DISPATCH_MAX_TEXT_LENGTH,
  DesktopDispatchApprovalInputSchema,
  DesktopDispatchLastTargetSchema,
  DesktopDispatchResultSchema,
  type DesktopDispatchAttachment,
  type DesktopDispatchResult,
  type DesktopDispatchSessionRef,
} from '@/shared/data/types/desktopDispatchTool';
import { FileEntryIdSchema, type FileEntry } from '@/shared/data/types/file';
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { ManagedFileResolver, TurnToolResources } from '../resources/managedFileResolver';
import {
  raceAbort,
  type RuntimeArtifact,
  type RuntimeJsonValue,
  type RuntimeTool,
  type RuntimeToolCall,
  type RuntimeToolResult,
} from '../runtime';
import { toolValidationError, toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export type DesktopDispatchAccess = {
  connections: Pick<DesktopConnectionService, 'list' | 'getById'>;
  remoteAgent: Pick<RemoteAgentModule, 'open'>;
  preference: Pick<PreferenceService, 'get' | 'set'>;
  createTextArtifact(
    input: { name: string; data: string; mediaType: string },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

type DispatchMetadata = {
  devices?: readonly DesktopConnection[];
  availableFiles?: TurnToolResources['availableFiles'];
  localSessionId: string;
};

const REMOTE_TIMEOUT_MS = 20_000;
const SNAPSHOT_WAIT_MS = 1000;
const REPLY_PREVIEW_LENGTH = 2000;
const LAST_TARGET_KEY = 'desktop.dispatch.last_target';
const connectionIdSchema = z.string().min(1);
const listAgentsSchema = z.strictObject({
  connection_id: connectionIdSchema,
  cursor: z.string().optional(),
});
const listWorkspacesSchema = listAgentsSchema.extend({ agent_id: z.string().min(1) });
const dispatchSchema = z.strictObject({
  connection_id: connectionIdSchema,
  agent_id: z.string().min(1),
  workspace: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('registered'),
      id: z.string().min(1),
      name: z.string().optional(),
    }),
    z.strictObject({ kind: z.literal('system') }),
  ]),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1),
  file_entry_ids: z.array(FileEntryIdSchema).max(DESKTOP_DISPATCH_MAX_ATTACHMENTS).optional(),
});
const readSessionSchema = z
  .strictObject({
    connection_id: connectionIdSchema,
    session_id: z.string().min(1).optional(),
    draft_id: z.string().min(1).optional(),
  })
  .refine(({ session_id, draft_id }) => (session_id !== undefined) !== (draft_id !== undefined), {
    message: 'Provide exactly one of session_id or draft_id.',
  });

class DesktopDispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isDispatchDevice(connection: DesktopConnection): boolean {
  return connection.status === 'paired' && connection.capabilities.includes('agent');
}

export function createDesktopDispatchTools(
  access: DesktopDispatchAccess,
  fileAccess: WorkspaceFileAccess,
  files: ManagedFileResolver,
  initialDispatchedSessions: readonly DesktopDispatchSessionRef[],
  metadata: DispatchMetadata,
): RuntimeTool[] {
  const deviceNames = new Map(metadata.devices?.map(({ id, name }) => [id, name]));
  const agentNames = new Map<string, string>();
  const workspaceNames = new Map<string, string>();
  const { localSessionId } = metadata;
  const allowedSessions = [...initialDispatchedSessions];

  async function requireDevice(connectionId: string) {
    const connection = await access.connections.getById(connectionId);
    if (!connection || !isDispatchDevice(connection))
      throw new DesktopDispatchError(
        'DESKTOP_NOT_PAIRED',
        'Select a paired desktop with Agent access.',
      );
    deviceNames.set(connectionId, connection.name);
    return connection;
  }

  function approvalDetails(input: z.infer<typeof dispatchSchema>) {
    const connectionId = input.connection_id;
    const agentId = input.agent_id;
    const workspace = input.workspace;
    return DesktopDispatchApprovalInputSchema.parse({
      connectionId,
      connectionName: deviceNames.get(connectionId) || connectionId,
      agentId,
      agentName: agentNames.get(JSON.stringify([connectionId, agentId])) || agentId,
      workspace,
      workspaceName:
        workspace.kind === 'system'
          ? 'System default'
          : workspaceNames.get(JSON.stringify([connectionId, agentId, workspace.id])) ||
            workspace.id,
      title: input.title,
      text: input.text,
      textCharLength: input.text.length,
      attachments: [...new Set(input.file_entry_ids)].map((id) =>
        attachmentDetails(id, metadata.availableFiles?.get(id)),
      ),
    });
  }

  const dispatch = desktopTool({
    capabilityId: 'desktop_dispatch_task',
    displayName: 'Dispatch task to desktop',
    description:
      'Request approval to start a new desktop Agent session in the selected workspace with a title, a Markdown brief and authorized managed file attachments. A pending confirmation may already have reached the desktop. Check its session before considering another dispatch.',
    schema: dispatchSchema,
    write: true,
    async run(input, signal, { turnId, toolCallId }) {
      const { text, textCharLength: _textCharLength, ...details } = approvalDetails(input);
      const value = { ...details, promptPreview: text.slice(0, 240) };
      const artifacts: RuntimeArtifact[] = [];
      const draftId = `dispatch-${sha256HexOfText(JSON.stringify([localSessionId, turnId, toolCallId]))}`;
      const { workspace } = DesktopDispatchLastTargetSchema.parse(details);
      const finish = (operation: RemoteDispatchReceipt, errorMessage?: string) => {
        const { id: operationId, sessionId, error } = operation;
        if (sessionId) allowedSessions.push({ connectionId: details.connectionId, sessionId });
        else allowedSessions.push({ connectionId: details.connectionId, draftId, operationId });
        return result(
          DesktopDispatchResultSchema.parse({
            ...value,
            status: dispatchStatus(operation),
            draftId,
            operationId,
            ...(sessionId ? { sessionId } : {}),
            ...(error ? { error } : {}),
            ...(errorMessage ? { errorMessage } : {}),
            localSessionId,
          }),
          artifacts,
        );
      };
      try {
        const connection = await requireDevice(details.connectionId);
        value.connectionName = connection.name || value.connectionName;
        const ids = await Promise.all(
          details.attachments.map(({ fileEntryId }) =>
            fileAccess.resolveRead({ file_entry_id: fileEntryId }).catch(() => {
              throw new DesktopDispatchError(
                'ATTACHMENT_UNAVAILABLE',
                'An attachment is outside the authorized file scope.',
              );
            }),
          ),
        );
        if (ids.length) {
          const resolved = await files.resolveAvailable(ids);
          value.attachments = ids.map((id) => {
            const file = resolved.get(id);
            if (!file)
              throw new DesktopDispatchError(
                'ATTACHMENT_UNAVAILABLE',
                'An authorized attachment is unavailable.',
              );
            return attachmentDetails(id, file);
          });
        }
        return await withDesktopSource(
          access.remoteAgent,
          details.connectionId,
          signal,
          async (source, boundedSignal) => {
            const existing = source.getDispatch(draftId);
            if (existing) return finish(existing);
            if (isOffline(source))
              throw new DesktopDispatchError(
                'CONNECTION_LOST',
                'The desktop is offline or suspended.',
              );
            let dispatchText = text;
            if (text.length > DESKTOP_DISPATCH_MAX_TEXT_LENGTH) {
              if (
                value.attachments.length < DESKTOP_DISPATCH_MAX_ATTACHMENTS &&
                source.getState().attachments === undefined
              )
                await source.listAgents(undefined, boundedSignal);
              if (
                source.getState().attachments !== true ||
                value.attachments.length >= DESKTOP_DISPATCH_MAX_ATTACHMENTS
              )
                throw new DesktopDispatchError(
                  'REMOTE_TEXT_TOO_LONG',
                  'The brief exceeds 32,768 characters and the desktop cannot accept it as an additional attachment. Shorten the brief or free an attachment slot.',
                );
              const spilled = await access.createTextArtifact(
                {
                  name: 'task-brief.md',
                  data: text,
                  mediaType: 'text/markdown',
                },
                boundedSignal,
              );
              value.attachments.push({
                fileEntryId: spilled.id,
                name: spilled.filename,
                mediaType: spilled.mediaType,
              });
              artifacts.push({
                ref: { kind: 'managed-file', fileEntryId: spilled.id },
                name: spilled.filename,
                mediaType: spilled.mediaType,
                kind: 'created',
              });
              dispatchText = `Read the attached Markdown file ${JSON.stringify(spilled.filename)} for the full task brief and carry out that task.`;
            }
            boundedSignal.throwIfAborted();
            // Once admitted, the scope owns recovery and returns the durable operation receipt.
            const operation = await source.start({
              draftId,
              dispatch: true,
              agentId: details.agentId,
              title: details.title,
              workspace,
              text: dispatchText,
              attachments: value.attachments,
            });
            if (operation.status === 'applied' || operation.status === 'pending') {
              await access.preference
                .set(LAST_TARGET_KEY, {
                  connectionId: details.connectionId,
                  agentId: details.agentId,
                  workspace,
                })
                .catch(() => undefined);
            }
            return finish(operation, operation.errorMessage);
          },
          true,
        );
      } catch (error) {
        signal.throwIfAborted();
        const failure = desktopFailure(error);
        return result(
          DesktopDispatchResultSchema.parse({
            ...value,
            status: failure.error === 'CONNECTION_LOST' ? 'desktop_offline' : 'rejected',
            error: failure.error,
            errorMessage: failure.message,
          }),
          artifacts,
        );
      }
    },
  });
  dispatch.inputPreview = { textField: 'title', nameField: 'connection_id' };
  dispatch.approvalInput = (input) => {
    const parsed = dispatchSchema.safeParse(input);
    return parsed.success ? approvalDetails(parsed.data) : input;
  };

  return [
    desktopTool({
      capabilityId: 'desktop_list_devices',
      displayName: 'List paired desktops',
      description:
        'List locally paired desktops with Agent access and the last desktop delegation target. This lookup does not connect to a desktop.',
      schema: z.strictObject({}),
      async run() {
        const { items } = await access.connections.list();
        const target = DesktopDispatchLastTargetSchema.safeParse(
          await access.preference.get(LAST_TARGET_KEY),
        );
        const lastTarget = target.success ? target.data : null;
        const devices = items
          .filter(isDispatchDevice)
          .map(({ id, name, defaultName, capabilities }) => {
            deviceNames.set(id, name);
            return {
              connectionId: id,
              name,
              defaultName,
              capabilities,
              isLastTarget: lastTarget?.connectionId === id,
            };
          });
        return result({ devices, lastTarget });
      },
    }),
    desktopTool({
      capabilityId: 'desktop_list_agents',
      displayName: 'List desktop Agents',
      description:
        'Connect to the chosen paired desktop and list its Agents. Use the returned nextCursor for another page.',
      schema: listAgentsSchema,
      async run({ connection_id, cursor }, signal) {
        const connection = await requireDevice(connection_id);
        return withDesktopSource(
          access.remoteAgent,
          connection_id,
          signal,
          async (source, boundedSignal) => {
            const page = await source.listAgents(cursor, boundedSignal);
            const agents = page.items.map(({ id, name, emoji, model }) => {
              agentNames.set(JSON.stringify([connection_id, id]), name);
              return { id, name, emoji: emoji ?? null, modelName: model?.name ?? null };
            });
            return result({
              connectionId: connection_id,
              connectionName: connection.name,
              agents,
              nextCursor: page.next ?? null,
            });
          },
        );
      },
    }),
    desktopTool({
      capabilityId: 'desktop_list_workspaces',
      displayName: 'List desktop workspaces',
      description:
        'Connect to the chosen desktop and list its registered workspaces for the specified Agent. The system workspace is available only when supportsSystemWorkspace is true.',
      schema: listWorkspacesSchema,
      async run({ connection_id, agent_id, cursor }, signal) {
        await requireDevice(connection_id);
        return withDesktopSource(
          access.remoteAgent,
          connection_id,
          signal,
          async (source, boundedSignal) => {
            const page = await source.listWorkspaces(agent_id, cursor, boundedSignal);
            for (const workspace of page.items)
              workspaceNames.set(
                JSON.stringify([connection_id, agent_id, workspace.id]),
                workspace.name,
              );
            return result({
              connectionId: connection_id,
              agentId: agent_id,
              workspaces: [...page.items],
              supportsSystemWorkspace: page.systemWorkspace === true,
              nextCursor: page.next ?? null,
            });
          },
        );
      },
    }),
    dispatch,
    desktopTool({
      capabilityId: 'desktop_read_session',
      displayName: 'Read a dispatched desktop session',
      description:
        'Read the latest reply and execution status of a desktop session dispatched from this local conversation. Provide connection_id and exactly one of session_id or draft_id using the IDs returned by desktop_dispatch_task. Use draft_id while the session ID is unknown to look up that exact dispatch.',
      schema: readSessionSchema,
      async run({ connection_id: connectionId, session_id, draft_id }, signal) {
        const ref = allowedSessions.find(
          (candidate) =>
            candidate.connectionId === connectionId &&
            (session_id !== undefined
              ? candidate.sessionId === session_id
              : candidate.draftId === draft_id),
        );
        if (!ref)
          return result({
            status: 'forbidden',
            error: 'SESSION_NOT_IN_SCOPE',
            message: 'Only desktop sessions dispatched from this local conversation can be read.',
          });
        await requireDevice(connectionId);
        return withDesktopSource(
          access.remoteAgent,
          connectionId,
          signal,
          async (source, boundedSignal) => {
            if (ref.sessionId !== undefined)
              return readDesktopSession(source, connectionId, ref.sessionId, boundedSignal);
            const { draftId, operationId } = ref;
            const receipt = source.getDispatch(draftId, operationId);
            if (receipt?.sessionId && !isOffline(source)) {
              allowedSessions.push({ connectionId, sessionId: receipt.sessionId });
              return readDesktopSession(source, connectionId, receipt.sessionId, boundedSignal);
            }
            return result({
              connectionId,
              draftId,
              operationId,
              status: receipt ? dispatchStatus(receipt) : 'unavailable',
              ...(receipt?.sessionId ? { sessionId: receipt.sessionId } : {}),
              ...(receipt?.error ? { error: receipt.error } : {}),
            });
          },
          Boolean(ref.draftId),
        );
      },
    }),
  ];
}

function attachmentDetails(
  fileEntryId: DesktopDispatchAttachment['fileEntryId'],
  file?: { name: string; mediaType: string },
): DesktopDispatchAttachment {
  return {
    fileEntryId,
    name: file?.name || fileEntryId,
    mediaType: file?.mediaType || 'application/octet-stream',
  };
}

function result(value: RuntimeJsonValue, artifacts: RuntimeArtifact[] = []): RuntimeToolResult {
  return { value, artifacts };
}

function desktopTool<T>(definition: {
  capabilityId: string;
  displayName: string;
  description: string;
  schema: z.ZodType<T>;
  write?: boolean;
  run(input: T, signal: AbortSignal, call: RuntimeToolCall): Promise<RuntimeToolResult>;
}): RuntimeTool {
  const { capabilityId, displayName, description, schema, write, run } = definition;
  return {
    ref: { source: 'builtin', capabilityId },
    providerName: capabilityId,
    displayName,
    description,
    inputSchema: toRuntimeInputSchema(schema),
    approval: write ? 'ask' : 'auto',
    ...(write ? { autoApprovalEligible: false } : {}),
    effect: write ? 'write' : 'read',
    deferred: true,
    async execute(call) {
      const { input, signal } = call;
      signal.throwIfAborted();
      const parsed = schema.safeParse(input);
      if (!parsed.success)
        return result({
          status: 'error',
          error: 'INVALID_INPUT',
          message: toolValidationError(parsed.error),
        });
      try {
        return await run(parsed.data, signal, call);
      } catch (error) {
        signal.throwIfAborted();
        return result({ status: 'error', ...desktopFailure(error) });
      }
    },
  };
}

function desktopFailure(error: unknown) {
  if (error instanceof DesktopDispatchError) return { error: error.code, message: error.message };
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  if (error instanceof DesktopUnreachableError || code === 'CONNECTION_LOST')
    return { error: 'CONNECTION_LOST', message: 'The desktop is offline or unreachable.' };
  return { error: code ?? 'DESKTOP_REQUEST_FAILED', message: 'The desktop request failed.' };
}

function isOffline(source: RemoteAgentSource) {
  const { status } = source.getState();
  return status === 'offline' || status === 'suspended';
}

function dispatchStatus(operation: RemoteDispatchReceipt): DesktopDispatchResult['status'] {
  if (operation.status === 'applied') return 'dispatched';
  if (operation.status === 'pending') return 'pending_confirmation';
  return operation.error === 'CONNECTION_LOST' ? 'desktop_offline' : 'rejected';
}

async function withDesktopSource<T>(
  remoteAgent: DesktopDispatchAccess['remoteAgent'],
  connectionId: string,
  signal: AbortSignal,
  work: (source: RemoteAgentSource, signal: AbortSignal) => Promise<T>,
  allowOffline = false,
): Promise<T> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DesktopDispatchError('DESKTOP_TIMEOUT', 'Timed out waiting for the desktop.'),
      ),
    REMOTE_TIMEOUT_MS,
  );
  const linked = linkAbortSignals([signal, deadline.signal]);
  try {
    linked.signal.throwIfAborted();
    const source = await remoteAgent.open(connectionId, linked.signal);
    try {
      if (!allowOffline && isOffline(source))
        throw new DesktopDispatchError('CONNECTION_LOST', 'The desktop is offline or suspended.');
      return await work(source, linked.signal);
    } catch (error) {
      if (isOffline(source))
        throw new DesktopDispatchError('CONNECTION_LOST', 'The desktop is offline or suspended.');
      throw error;
    } finally {
      source.dispose();
    }
  } finally {
    clearTimeout(timer);
    linked.dispose();
  }
}

async function readDesktopSession(
  source: RemoteAgentSource,
  connectionId: string,
  sessionId: string,
  signal: AbortSignal,
) {
  const snapshot = await readCurrentSnapshot(source, sessionId, signal);
  const session = snapshot?.session ?? (await source.readSession(sessionId, signal));
  const active = snapshot?.executions.find(
    ({ state }) => state === 'running' || state === 'awaiting-approval' || state === 'finalizing',
  );
  let assistant = snapshot?.messages.findLast(({ role }) => role === 'assistant');
  if (!assistant) {
    const page = await source.history(sessionId, session.historyVersion, undefined, signal);
    assistant = page.items.find(({ role }) => role === 'assistant');
  }
  const pendingApproval = snapshot?.interactions.find(
    ({ state, kind }) => state === 'pending' && kind !== 'question',
  );
  const pendingSend =
    source
      .getStarts()
      .some((start) => start.sessionId === sessionId && start.status === 'pending') ||
    source
      .getCommands()
      .some(
        (command) =>
          command.sessionId === sessionId &&
          command.kind === 'send' &&
          command.status === 'pending',
      );
  const executionStatus =
    active?.state ??
    snapshot?.executions.at(-1)?.state ??
    (pendingSend ? 'pending-confirm' : messageExecutionState(assistant));
  const recentTools = (assistant?.parts ?? [])
    .filter((part): part is Extract<RemoteMessagePart, { kind: 'tool' }> => part.kind === 'tool')
    .slice(-2)
    .toReversed()
    .map(({ name, state }) => ({ name, state }));
  return result({
    status: 'ok',
    connectionId,
    sessionId,
    sessionTitle: session.title,
    executionStatus,
    ...(pendingApproval ? { pendingApprovalTitle: pendingApproval.title } : {}),
    latestReply: await latestReply(source, assistant, signal),
    recentTools,
  });
}

function messageExecutionState(message: RemoteMessageView | undefined) {
  switch (message?.state) {
    case 'streaming':
      return 'running';
    case 'error':
      return 'failed';
    case 'success':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
}

async function readCurrentSnapshot(
  source: RemoteAgentSource,
  sessionId: string,
  signal: AbortSignal,
) {
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await raceAbort(
      new Promise<RemoteSessionSnapshot | undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), SNAPSHOT_WAIT_MS);
        unsubscribe = source.observe(sessionId, (snapshot) => {
          if (snapshot.current) resolve(snapshot);
        });
      }),
      signal,
    );
  } finally {
    clearTimeout(timer);
    unsubscribe?.();
  }
}

async function latestReply(
  source: RemoteAgentSource,
  assistant: RemoteMessageView | undefined,
  signal: AbortSignal,
) {
  let reply = '';
  for (const part of assistant?.parts.toReversed() ?? []) {
    if (part.kind !== 'text') continue;
    let text = part.text;
    if (!part.complete && part.resource) {
      const resource = await source.readResource(part.resource, signal);
      if (resource.kind === 'text') text = resource.text;
    }
    if (text.trim())
      reply = [text.trim(), reply].filter(Boolean).join('\n').slice(-REPLY_PREVIEW_LENGTH);
    if (reply.length === REPLY_PREVIEW_LENGTH) break;
  }
  return reply.trim();
}
