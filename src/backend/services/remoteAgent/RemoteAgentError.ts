import type { AgentMethod } from '@cherrystudio/remote-protocol/agent';

export class RemoteAgentError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly detail?: string,
    readonly method?: AgentMethod,
  ) {
    super(code);
    this.name = 'RemoteAgentError';
  }
}
