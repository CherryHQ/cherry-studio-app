export class RemoteAgentError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
    this.name = 'RemoteAgentError';
  }
}
