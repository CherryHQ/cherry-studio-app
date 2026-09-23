import type { MessageUsageSummary } from '@/shared/contracts/messageUsage';

import type { ExecutionFailure } from '../aiFailure';
import type { InteractionQuestion } from '../interaction';

export type RemoteWorkspaceSelection = { kind: 'registered'; id: string } | { kind: 'system' };
export type RemoteStartInput = { draftId: string; agentId: string; text: string } & (
  | { workspace: RemoteWorkspaceSelection; workspaceId?: never }
  | { workspaceId: string; workspace?: never }
);
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
  errorMessage?: string;
}>;
export type RemoteStartOperation = Readonly<{
  id: string;
  draftId: string;
  agentId: string;
  workspaceId?: string;
  workspace?: RemoteWorkspaceSelection;
  text: string;
  status: 'pending' | 'applied' | 'rejected' | 'interrupted';
  sessionId?: string;
  error?: string;
  errorMessage?: string;
}>;

export type RemoteSourceState = Readonly<{
  status: 'connecting' | 'ready' | 'offline' | 'suspended' | 'retired';
  reason?: string;
}>;
export type RemoteSessionView = {
  id: string;
  agentId: string;
  workspaceId: string;
  workspaceKind?: 'registered' | 'system';
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
export type RemoteModelSummary = { modelId: string; providerId: string; name: string };
export type RemoteMessageView = {
  model?: RemoteModelSummary;
  usage?: MessageUsageSummary;
  id: string;
  version: string;
  role: 'user' | 'assistant' | 'system';
  parts: readonly RemoteMessagePart[];
  state: 'streaming' | 'success' | 'error' | 'cancelled';
  failure?: ExecutionFailure;
  persistenceFailure?: ExecutionFailure;
};
export type RemoteSessionSnapshot = {
  historyEpoch?: string;
  session: RemoteSessionView;
  current: boolean;
  sendTarget?: string;
  messages: readonly RemoteMessageView[];
  executions: readonly {
    id: string;
    messageId?: string;
    failure?: ExecutionFailure;
    persistenceFailure?: ExecutionFailure;
    durable?: boolean;
    history?: { historyRevision: string; messageRevision: string };
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
    kind?: 'decision' | 'question';
    state: 'pending' | 'approved' | 'denied' | 'expired';
    input: RemoteResource;
    respondTarget?: string;
  }[];
};
export type RemoteResourceValue =
  | { kind: 'question'; questions: readonly InteractionQuestion[] }
  | { kind: 'text'; text: string }
  | { kind: 'metadata'; name: string; mediaType?: string; byteLength?: string };
export type RemotePage<T> = { items: readonly T[]; next?: string };

/** Display values rebound to the current source; never an installed history window. */
export type RemoteSessionReadPreview = {
  epoch?: string;
  session: RemoteSessionView;
  history?: {
    items: RemoteMessageView[];
    version: string;
    readAt: number;
    hasOlderMessages: boolean;
    complete: boolean;
  };
};
