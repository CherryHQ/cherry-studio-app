export class RemoteAgentError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'RemoteAgentError';
  }
}
