import type { AgentSubmitMessageInput } from '@/shared/contracts/agent';

import type {
  AgentRef,
  ConversationAction,
  ConversationCatalog,
  ConversationExecution,
  ConversationFailure,
  ConversationMessage,
  ConversationRef,
  ConversationSnapshot,
  ConversationSource,
  QueryScope,
  Readable,
  TranscriptSnapshot,
  WorkspaceRef,
} from '../contracts';

/**
 * Desktop-owned conversation contract. Everything here exists because the authoritative state lives
 * on another machine: opened observations, revisioned history windows, uncertain commands, drafts
 * with idempotent starts and deferred content. Local chat never implements it.
 */
type Opaque<Tag extends string> = string & { readonly __tag: Tag };
export type MessageRef = Opaque<'conversation-message'>;
export type ExecutionRef = Opaque<'conversation-execution'>;
export type InteractionRef = Opaque<'conversation-interaction'>;
export type HistoryVersion = Opaque<'conversation-history-version'>;
export type HistoryCursor = Opaque<'conversation-history-cursor'>;
export type OperationId = Opaque<'conversation-operation'>;
export type DraftId = Opaque<'conversation-draft'>;

export type ConversationInput = Pick<
  AgentSubmitMessageInput,
  'parts' | 'modelId' | 'reasoningEffort' | 'imageGeneration'
>;
export type InputPolicy = {
  attachments: boolean;
  pluginReferences: boolean;
  modelSelection: boolean;
  textLimit?: { unit: 'utf8-bytes' | 'utf16-units'; value: number };
};
export type Submission = {
  conversation: ConversationRef;
  userMessage?: MessageRef;
  execution?: ExecutionRef;
};
export type ConversationOperation = {
  id: OperationId;
  kind: 'start' | 'send' | 'cancel' | 'respond';
  state: 'pending' | 'applied' | 'rejected' | 'interrupted';
  conversation?: ConversationRef;
  draftId?: DraftId;
  /** Admitted input remains recoverable after navigation and explicit rejection. */
  input?: ConversationInput;
  recovery?: ConversationAction<void, void>;
  dismiss?: () => void;
  failure?: ConversationFailure;
};
export type RemoteConversationExecution = ConversationExecution & {
  terminal?: { message: ConversationMessage; durable: boolean; historyReady: boolean };
};
export type RemoteConversationSnapshot = Omit<ConversationSnapshot, 'executions'> & {
  historyVersion: HistoryVersion;
  executions: readonly RemoteConversationExecution[];
  actions: {
    inputPolicy: InputPolicy;
    send?: ConversationAction<ConversationInput, Submission>;
  };
};
export type HistoryPage = {
  items: readonly ConversationMessage[];
  older?: HistoryCursor;
  newer?: HistoryCursor;
};
export interface HistoryWindow {
  readonly scope: QueryScope;
  readonly version: HistoryVersion;
  readonly initial: HistoryPage;
  read(cursor: HistoryCursor, signal: AbortSignal): Promise<HistoryPage>;
  dispose(): void;
}
export type HistoryPreview = {
  items: readonly ConversationMessage[];
  version: HistoryVersion;
  readAt: number;
  hasOlderMessages: boolean;
  complete: boolean;
};
export interface ConversationHistory {
  peekLatest?: () => HistoryPreview | undefined;
  subscribePreview?: (listener: () => void) => () => void;
  openLatest(signal: AbortSignal): Promise<HistoryWindow>;
  openAround?: (message: MessageRef, signal: AbortSignal) => Promise<HistoryWindow>;
  prepareSelection(messageIds: readonly string[], signal: AbortSignal): Promise<TranscriptSnapshot>;
}
export interface RemoteConversationSession {
  readonly ref: ConversationRef;
  readonly scope: QueryScope;
  readonly state: Readable<RemoteConversationSnapshot>;
  readonly history: ConversationHistory;
  readonly operations: Readable<readonly ConversationOperation[]>;
  activate(): () => void;
  refresh(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
export interface ConversationDraft {
  readonly id: DraftId;
  readonly state: Readable<{
    inputPolicy: InputPolicy;
    start: ConversationAction<ConversationInput, Submission>;
  }>;
  readonly operations: Readable<readonly ConversationOperation[]>;
  dispose(): void;
}
export interface RemoteConversationCatalog extends ConversationCatalog {
  prepareDraft(
    input: { agent: AgentRef; workspace?: WorkspaceRef; draftId: DraftId },
    signal: AbortSignal,
  ): Promise<ConversationDraft>;
}
export interface RemoteConversationSource extends ConversationSource {
  /** Stable identity/grant binding for unsent drafts; independent of Query lifetime. */
  readonly draftScope: string;
  readonly operations: Readable<readonly ConversationOperation[]>;
  readonly catalog: RemoteConversationCatalog;
  openSession(ref: ConversationRef, signal: AbortSignal): Promise<RemoteConversationSession>;
}
export function isRemoteConversationSource(
  source: ConversationSource,
): source is RemoteConversationSource {
  return source.ref.kind === 'desktop' && 'openSession' in source;
}
