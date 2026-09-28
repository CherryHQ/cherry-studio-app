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
/**
 * The latest input the desktop did not deliver. A Session or Draft holds at most one; pending work is
 * recovered by the journal and never shown here.
 */
export type UndeliveredMessage = {
  id: OperationId;
  input: ConversationInput;
  state: 'rejected' | 'interrupted';
  failure?: ConversationFailure;
  /** Submits the same input through the owner's current send or start, replacing this message. */
  resend: ConversationAction<void, Submission>;
  discard(): void;
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
  undelivered?: UndeliveredMessage;
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
  activate(): () => void;
  refresh(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
export interface ConversationDraft {
  readonly id: DraftId;
  readonly state: Readable<{
    inputPolicy: InputPolicy;
    start: ConversationAction<ConversationInput, Submission>;
    /** The Session this draft's start created; the route hands off to it, then releases the start. */
    created?: { conversation: ConversationRef; release(): void };
    undelivered?: UndeliveredMessage;
  }>;
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
  readonly catalog: RemoteConversationCatalog;
  /** Whether the draft's input already belongs to a start; an undelivered one stays with the draft. */
  hasSubmission(draftId: DraftId): boolean;
  openSession(ref: ConversationRef, signal: AbortSignal): Promise<RemoteConversationSession>;
}
export function isRemoteConversationSource(
  source: ConversationSource,
): source is RemoteConversationSource {
  return source.ref.kind === 'desktop' && 'openSession' in source;
}
