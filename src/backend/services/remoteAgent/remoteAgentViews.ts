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
type ToolPart = Extract<AgentPart, { kind: 'tool-input' | 'tool-output' }>;
type ToolSources = { first: ToolPart; input?: ToolPart; output?: ToolPart };
/** Part views keyed by their first protocol part; a tool view also depends on its latest input and output. */
export type PartViewCache = WeakMap<
  AgentPart,
  { input?: AgentPart; output?: AgentPart; view: RemoteMessagePart }
>;
function projectPart(
  sessionId: string,
  part: Exclude<AgentPart, ToolPart>,
  issueResource: ResourceIssuer,
): RemoteMessagePart {
  const resource = () => issueResource(sessionId, { kind: 'part', part });
  if (part.kind === 'text' || part.kind === 'reasoning') {
    const complete = 'text' in part.content;
    return {
      id: part.partId,
      kind: part.kind,
      text: complete ? (part.content as { text: string }).text : '',
      complete,
      state: part.state,
      ...(!complete ? { resource: resource() } : {}),
    };
  }
  if (part.kind === 'data' && part.name === 'file') {
    let metadata: { filename?: string; mediaType?: string } = {};
    if ('text' in part.content) {
      try {
        metadata = JSON.parse(part.content.text);
      } catch {
        /* Unknown metadata stays a named attachment. */
      }
    }
    return {
      id: part.partId,
      kind: 'file',
      name: typeof metadata?.filename === 'string' ? metadata.filename : 'file',
      mediaType: typeof metadata?.mediaType === 'string' ? metadata.mediaType : undefined,
      resource: resource(),
    };
  }
  if (part.kind === 'file')
    return {
      id: part.partId,
      kind: 'file',
      name: part.name,
      mediaType: part.ref.mediaType,
      byteLength: part.ref.byteLength,
      resource: resource(),
    };
  return { id: part.partId, kind: 'data', name: part.name, resource: resource() };
}
function projectTool(
  sessionId: string,
  { first, input, output }: ToolSources,
  issueResource: ResourceIssuer,
): RemoteMessagePart {
  const key = first.toolCallId ?? first.partId;
  return {
    id: key,
    callId: key,
    kind: 'tool',
    name: first.toolName,
    state: output
      ? output.state
      : first.kind === 'tool-input' && first.state === 'completed'
        ? 'input-ready'
        : first.state,
    ...(input ? { input: issueResource(sessionId, { kind: 'part', part: input }) } : {}),
    ...(output ? { output: issueResource(sessionId, { kind: 'part', part: output }) } : {}),
  };
}
export function projectMessage(
  sessionId: string,
  message: AgentMessage,
  parts: readonly AgentPart[],
  issueResource: ResourceIssuer,
  partViews?: PartViewCache,
): RemoteMessageView {
  // A tool's input and output parts merge into one view at the position of the first.
  const entries: (
    | { part: Exclude<AgentPart, ToolPart>; tool?: undefined }
    | { part?: undefined; tool: ToolSources }
  )[] = [];
  const tools = new Map<string, ToolSources>();
  for (const part of parts) {
    if (part.kind === 'tool-input' || part.kind === 'tool-output') {
      const key = part.toolCallId ?? part.partId;
      let tool = tools.get(key);
      if (!tool) {
        tool = { first: part };
        tools.set(key, tool);
        entries.push({ tool });
      }
      if (part.kind === 'tool-input') tool.input = part;
      else tool.output = part;
    } else entries.push({ part });
  }
  // Streaming replaces only the parts it changes; unchanged parts keep their views.
  const result = entries.map(({ part, tool }) => {
    const source = tool ? tool.first : part;
    const cached = partViews?.get(source);
    if (cached && cached.input === tool?.input && cached.output === tool?.output)
      return cached.view;
    const view = tool
      ? projectTool(sessionId, tool, issueResource)
      : projectPart(sessionId, part, issueResource);
    partViews?.set(source, { input: tool?.input, output: tool?.output, view });
    return view;
  });
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
