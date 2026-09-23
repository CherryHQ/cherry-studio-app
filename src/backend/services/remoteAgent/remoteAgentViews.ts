import type {
  AgentMessage,
  AgentPart,
  AgentProjection,
  AgentSession,
} from '@cherrystudio/remote-protocol/agent';

import type {
  RemoteMessagePart,
  RemoteMessageView,
  RemoteSessionSnapshot,
  RemoteSessionView,
} from '@/shared/contracts/remoteAgent';

export const projectSession = (session: AgentSession): RemoteSessionView => ({
  id: session.sessionId,
  agentId: session.agentId,
  workspaceId: session.workspaceId,
  workspaceKind: session.workspaceKind,
  title: session.title,
  updatedAt: session.updatedAt,
  historyVersion: session.historyRevision,
});
export type RemoteResourceDescriptor =
  | { kind: 'part'; part: AgentPart }
  | { kind: 'interaction'; id: string; revision: string; inputDigest: string };
export type ResourceIssuer = (sessionId: string, value: RemoteResourceDescriptor) => string;
export const commandTarget = (scope: string, kind: string, params: Record<string, string>) =>
  JSON.stringify({ scope, kind, params });
export function projectMessage(
  sessionId: string,
  message: AgentMessage,
  parts: readonly AgentPart[],
  issueResource: ResourceIssuer,
): RemoteMessageView {
  const result: RemoteMessagePart[] = [];
  const tools = new Map<string, Extract<RemoteMessagePart, { kind: 'tool' }>>();
  for (const part of parts) {
    const resource = () => issueResource(sessionId, { kind: 'part', part });
    if (part.kind === 'text' || part.kind === 'reasoning') {
      const complete = 'text' in part.content;
      result.push({
        id: part.partId,
        kind: part.kind,
        text: complete ? (part.content as { text: string }).text : '',
        complete,
        ...(!complete ? { resource: resource() } : {}),
      });
    } else if (part.kind === 'tool-input' || part.kind === 'tool-output') {
      const key = part.toolCallId ?? part.partId;
      let tool = tools.get(key);
      if (!tool) {
        tool = {
          id: key,
          callId: key,
          kind: 'tool',
          name: part.toolName,
          state:
            part.kind === 'tool-input' && part.state === 'completed' ? 'input-ready' : part.state,
        };
        tools.set(key, tool);
        result.push(tool);
      }
      if (part.kind === 'tool-input') tool.input = resource();
      else {
        tool.output = resource();
        tool.state = part.state;
      }
    } else if (part.kind === 'data' && part.name === 'file') {
      let metadata: { filename?: string; mediaType?: string } = {};
      if ('text' in part.content) {
        try {
          metadata = JSON.parse(part.content.text);
        } catch {
          /* Unknown metadata stays a named attachment. */
        }
      }
      result.push({
        id: part.partId,
        kind: 'file',
        name: typeof metadata?.filename === 'string' ? metadata.filename : 'file',
        mediaType: typeof metadata?.mediaType === 'string' ? metadata.mediaType : undefined,
        resource: resource(),
      });
    } else if (part.kind === 'file')
      result.push({
        id: part.partId,
        kind: 'file',
        name: part.name,
        mediaType: part.ref.mediaType,
        byteLength: part.ref.byteLength,
        resource: resource(),
      });
    else result.push({ id: part.partId, kind: 'data', name: part.name, resource: resource() });
  }
  return {
    id: message.messageId,
    version: message.revision,
    role: message.role,
    parts: result,
    state:
      message.status === 'pending'
        ? 'streaming'
        : message.status === 'paused'
          ? 'cancelled'
          : message.status,
    ...(message.model ? { model: { ...message.model } } : {}),
    ...(message.usage
      ? {
          usage: {
            ...message.usage,
            ...(message.usage.costs
              ? { costs: message.usage.costs.map((cost) => ({ ...cost })) }
              : {}),
          },
        }
      : {}),
    ...(message.failure ? { failure: message.failure } : {}),
  };
}
export function projectSnapshot(
  scope: string,
  value: AgentProjection,
  current: boolean,
  issueResource: ResourceIssuer,
): RemoteSessionSnapshot {
  const sessionId = value.session.sessionId;
  return {
    historyEpoch: value.cursor.streamEpoch,
    session: projectSession(value.session),
    current,
    ...(current && value.session.idleRevision
      ? {
          sendTarget: commandTarget(scope, 'send', {
            sessionId,
            expectedIdleRevision: value.session.idleRevision,
          }),
        }
      : {}),
    messages: Object.values(value.messages).map((message) =>
      projectMessage(
        sessionId,
        message,
        message.partIds.flatMap((id) => value.parts[id] ?? []),
        issueResource,
      ),
    ),
    executions: Object.values(value.executions).map((execution) => ({
      id: execution.executionId,
      state: execution.status,
      messageId: execution.messageId,
      failure: execution.failure,
      persistenceFailure: execution.persistenceFailure,
      durable: execution.durable,
      history: execution.history,
      ...(current && value.session.activeExecutionId === execution.executionId
        ? {
            cancelTarget: commandTarget(scope, 'cancel', {
              sessionId,
              expectedExecutionId: execution.executionId,
            }),
          }
        : {}),
    })),
    interactions: Object.values(value.interactions).map((interaction) => ({
      id: interaction.interactionId,
      executionId: interaction.executionId,
      title: interaction.summary,
      kind: interaction.kind,
      state: interaction.status,
      input: issueResource(sessionId, {
        kind: 'interaction',
        id: interaction.interactionId,
        revision: interaction.revision,
        inputDigest: interaction.inputDigest,
      }),
      ...(current && interaction.status === 'pending'
        ? {
            respondTarget: commandTarget(scope, 'respond', {
              sessionId,
              interactionId: interaction.interactionId,
              expectedRevision: interaction.revision,
              expectedExecutionId: interaction.executionId,
              inputDigest: interaction.inputDigest,
            }),
          }
        : {}),
    })),
  };
}
