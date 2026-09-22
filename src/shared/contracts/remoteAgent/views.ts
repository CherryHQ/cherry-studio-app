/** Durable operation views contain product state, never authorization or wire envelopes. */
export type RemoteCommand = Readonly<{
  id: string;
  kind: 'create' | 'send' | 'cancel' | 'respond';
  agentId?: string;
  userMessageId?: string;
  sessionId?: string;
  interactionId?: string;
  text?: string;
  status:
    | 'confirming'
    | 'accepted'
    | 'queued'
    | 'applied'
    | 'resolved'
    | 'cancelled'
    | 'execution-changed'
    | 'interrupted'
    | 'failed';
  error?: string;
}>;
export type RemoteStartOperation = Readonly<{
  id: string;
  draftId: string;
  agentId: string;
  workspaceId: string;
  text: string;
  status: 'pending' | 'applied' | 'rejected' | 'interrupted';
  sessionId?: string;
  error?: string;
}>;

export type RemoteSourceState = Readonly<{
  status: 'connecting' | 'ready' | 'offline' | 'suspended' | 'retired';
  reason?: string;
}>;
export type RemoteSessionView = {
  id: string;
  agentId: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  historyVersion: string;
};
export type RemoteResource = string;
export type RemoteMessagePart =
  | {
      id: string;
      kind: 'text' | 'reasoning';
      text: string;
      complete: boolean;
      resource?: RemoteResource;
    }
  | {
      id: string;
      kind: 'tool';
      name: string;
      callId: string;
      state: 'streaming' | 'input-ready' | 'completed' | 'failed';
      input?: RemoteResource;
      output?: RemoteResource;
    }
  | {
      id: string;
      kind: 'file';
      name: string;
      mediaType?: string;
      byteLength?: string;
      resource: RemoteResource;
    }
  | { id: string; kind: 'data'; name: string; resource: RemoteResource };
export type RemoteMessageView = {
  id: string;
  version: string;
  role: 'user' | 'assistant' | 'system';
  parts: readonly RemoteMessagePart[];
  state: 'streaming' | 'success' | 'error';
};
export type RemoteSessionSnapshot = {
  session: RemoteSessionView;
  current: boolean;
  sendTarget?: string;
  messages: readonly RemoteMessageView[];
  executions: readonly {
    id: string;
    state:
      | 'running'
      | 'awaiting-approval'
      | 'finalizing'
      | 'completed'
      | 'cancelled'
      | 'failed'
      | 'interrupted';
    cancelTarget?: string;
  }[];
  interactions: readonly {
    id: string;
    executionId?: string;
    title: string;
    state: 'pending' | 'approved' | 'denied' | 'expired';
    input: RemoteResource;
    respondTarget?: string;
  }[];
};
export type RemoteResourceValue =
  | { kind: 'text'; text: string }
  | { kind: 'metadata'; name: string; mediaType?: string; byteLength?: string };
export type RemotePage<T> = { items: readonly T[]; next?: string };
