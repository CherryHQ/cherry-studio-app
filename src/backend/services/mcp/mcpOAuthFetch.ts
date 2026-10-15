import { createFetchBridge } from '@/backend/services/http';
import { McpAuthorizationError } from '@/shared/contracts/mcp';

export function assertMcpOAuthUrl(value: string | URL): URL {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new McpAuthorizationError('configuration');
  }
  return url;
}

/** Adapt SDK metadata/form requests to the shared non-streaming HTTP transport. */
export function createMcpOAuthFetch(): typeof globalThis.fetch {
  return createFetchBridge({
    assertUrl: assertMcpOAuthUrl,
    unsupportedMethodError: () => new McpAuthorizationError('configuration'),
    maxResponseBytes: 512 * 1024,
    timeoutMs: 30_000,
  });
}
