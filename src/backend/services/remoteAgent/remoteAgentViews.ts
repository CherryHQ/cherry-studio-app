import type {
  AgentMessage,
  AgentPart,
  AgentProjection,
  AgentSession,
} from '@cherrystudio/remote-protocol/agent';

import type {
  RemoteMessageView,
  RemoteSessionSnapshot,
  RemoteSessionView,
} from '@/shared/contracts/remoteAgent';

import { projectMessage, type PartViewCache, type ResourceIssuer } from '../remoteConversation';
export type { RemoteResourceDescriptor } from '../remoteConversation';
export { projectMessage } from '../remoteConversation';

export const projectSession = (session: AgentSession): RemoteSessionView => ({
  id: session.sessionId,
  agentId: session.agentId,
  workspaceId: session.workspaceId,
  workspaceKind: session.workspaceKind,
  title: session.title,
  updatedAt: session.updatedAt,
  historyVersion: session.historyRevision,
});
export const commandTarget = (scope: string, kind: string, params: Record<string, string>) =>
  JSON.stringify({ scope, kind, params });
/** Projected messages and parts keyed by protocol object; valid while their sources keep identity. */
export type MessageViewCache = {
  messages: WeakMap<AgentMessage, { parts: readonly AgentPart[]; view: RemoteMessageView }>;
  parts: PartViewCache;
};
export const createMessageViewCache = (): MessageViewCache => ({
  messages: new WeakMap(),
  parts: new WeakMap(),
});
export function projectSnapshot(
  scope: string,
  value: AgentProjection,
  current: boolean,
  issueResource: ResourceIssuer,
  views?: MessageViewCache,
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
    // Events replace only the objects they change, so unchanged messages keep their views.
    messages: Object.values(value.messages).map((message) => {
      const parts = message.partIds.flatMap((id) => value.parts[id] ?? []);
      const cached = views?.messages.get(message);
      if (
        cached?.parts.length === parts.length &&
        cached.parts.every((part, index) => part === parts[index])
      )
        return cached.view;
      const view = projectMessage(sessionId, message, parts, issueResource, views?.parts);
      views?.messages.set(message, { parts, view });
      return view;
    }),
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
