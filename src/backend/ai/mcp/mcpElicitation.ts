import { randomUUID } from 'expo-crypto';

import {
  McpElicitationSchema,
  validateMcpElicitationResponse,
  type McpElicitationResponse,
  type McpPendingElicitation,
} from '@/shared/contracts/mcpInteraction';

/** Ephemeral consent belongs to the initiating call, never a restored transcript. */
export class McpElicitationBroker {
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<
    string,
    { view: McpPendingElicitation; finish: (response: McpElicitationResponse) => void }
  >();
  private snapshot: readonly McpPendingElicitation[] = [];

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  respond(id: string, response: McpElicitationResponse): void {
    const pending = this.pending.get(id);
    if (!pending) throw new Error('This MCP interaction has expired.');
    validateMcpElicitationResponse(pending.view.request, response);
    pending.finish(response);
  }
  async request(
    source: Pick<McpPendingElicitation, 'serverId' | 'serverName' | 'endpointUrl'>,
    params: unknown,
    signal: AbortSignal,
    toolApproval?: McpPendingElicitation['toolApproval'],
  ): Promise<McpElicitationResponse> {
    signal.throwIfAborted();
    if (this.pending.size >= 8 || JSON.stringify(params).length > 64 * 1024)
      return { action: 'cancel' };
    const parsed = McpElicitationSchema.safeParse({ mode: 'form', ...(params as object) });
    if (!parsed.success) return { action: 'cancel' };
    const request = parsed.data;
    if (request.mode === 'url') {
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || url.username || url.password) return { action: 'cancel' };
    } else if (Object.keys(request.requestedSchema.properties).length > 64)
      return { action: 'cancel' };
    const id = randomUUID();
    return new Promise((resolve) => {
      const finish = (response: McpElicitationResponse) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        this.pending.delete(id);
        this.publish();
        resolve(response);
      };
      const cancel = () => finish({ action: 'cancel' });
      const timer = setTimeout(cancel, 10 * 60 * 1000);
      this.pending.set(id, {
        view: { id, ...source, request, ...(toolApproval ? { toolApproval } : {}) },
        finish,
      });
      signal.addEventListener('abort', cancel, { once: true });
      this.publish();
      if (signal.aborted) cancel();
    });
  }
  stop(): void {
    for (const pending of [...this.pending.values()]) pending.finish({ action: 'cancel' });
  }
  private publish(): void {
    this.snapshot = [...this.pending.values()].map(({ view }) => view);
    for (const listener of this.listeners) listener();
  }
}
