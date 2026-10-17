export class RemoteConversationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'RemoteConversationError';
  }
}
