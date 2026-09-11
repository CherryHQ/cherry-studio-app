import type { CallToolResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError, type PluginErrorReason } from '@/shared/contracts/plugins';

import type { PluginCredential } from '../../authorization/pluginCredential';
import type { PluginClientContext } from '../../pluginDefinition';
import type { FeishuApiTool } from './feishuApiTool';
import { FeishuUserCredentialSchema } from './feishuCredentials';

const open = createHttpClient({ baseUrl: 'https://open.feishu.cn', timeoutMs: 30_000 });
const MAX_REQUEST_BYTES = 256 * 1024;
// Leave room for the MCP text envelope and JSON escaping in the runtime's 256 KiB result limit.
const MAX_RESPONSE_BYTES = 120 * 1024;
const FeishuResponseSchema = z.object({
  code: z.number().int().nonnegative().safe(),
  data: z.unknown().optional(),
});

// Official common errors plus Base's HTTP-200 business errors. Never classify by upstream msg.
const AUTHORIZATION_CODES = new Set([99991661, 99991668, 99991671, 99991677]);
const ACCESS_CODES = new Set([
  99991401, 99991662, 99991672, 99991673, 99991676, 99991679, 1254302, 1254303, 1254304,
]);
const QUOTA_CODES = new Set([99991400, 99991403, 1254290]);
const SERVER_CODES = new Set([1255001, 1255002, 1255003, 1255004, 1255005, 1255040]);

function apiError(code: number, isWrite: boolean): PluginError {
  let reason: PluginErrorReason = 'request';
  if (AUTHORIZATION_CODES.has(code)) reason = 'authorization';
  else if (ACCESS_CODES.has(code)) reason = 'access';
  else if (QUOTA_CODES.has(code)) reason = 'quota';
  else if (SERVER_CODES.has(code)) reason = isWrite ? 'unknown-write' : 'network';
  return new PluginError(
    reason,
    reason === 'unknown-write'
      ? `Feishu write outcome is unknown (code ${code}). Check the resource before retrying.`
      : `Feishu rejected the request (code ${code}). Check permissions and arguments before retrying.`,
  );
}

function unknownWriteError(): PluginError {
  return new PluginError(
    'unknown-write',
    'Feishu write outcome is unknown. Check the resource before retrying.',
  );
}

/** Fixed, validated operations only; renewal and grant ownership stay in the authorization runtime. */
export async function callFeishuOpenApi(
  context: PluginClientContext,
  tool: FeishuApiTool,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CallToolResult> {
  const isWrite = tool.access === 'write';
  let submitted = false;
  let credential: PluginCredential | undefined;
  try {
    signal.throwIfAborted();
    const request = tool.request(args);
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_REQUEST_BYTES)
      throw new PluginError(
        'request',
        'Feishu request is too large. Supply fewer fields or smaller values.',
      );
    credential = await context.getCredential(signal).catch((error: unknown) => {
      if (error instanceof PluginError) throw error;
      throw new PluginError('authorization', 'Feishu authorization is no longer available.');
    });
    const parsed = FeishuUserCredentialSchema.safeParse(credential);
    if (!parsed.success)
      throw new PluginError('authorization', 'Reconnect Feishu to authorize this operation.');
    const granted = new Set(parsed.data.tokens.scope.split(/\s+/));
    if (tool.scopes.some((scope) => !granted.has(scope)))
      throw new PluginError('authorization', 'Reconnect Feishu to grant the required permissions.');
    // A refresh can outlive disconnect. Recheck the durable grant after resolving the token.
    await context.assertAuthorized().catch(() => {
      throw new PluginError('authorization', 'Feishu authorization is no longer available.');
    });
    signal.throwIfAborted();
    submitted = true;
    const response = await open.request<unknown>({
      ...request,
      headers: { Authorization: `Bearer ${parsed.data.tokens.accessToken}` },
      signal,
      redirect: 'error',
      maxResponseBytes: MAX_RESPONSE_BYTES,
      errorDecoder: ({ data }) => {
        const parsed = FeishuResponseSchema.safeParse(data);
        return parsed.success
          ? { code: String(parsed.data.code), message: 'Feishu request failed.' }
          : undefined;
      },
    });
    signal.throwIfAborted();
    const result = FeishuResponseSchema.safeParse(response.data);
    if (!result.success)
      throw isWrite ? unknownWriteError() : new PluginError('request', 'Invalid Feishu response.');
    if (result.data.code !== 0) throw apiError(result.data.code, isWrite);
    // Preserve provider pagination and record IDs; never imply that one page is the entire result.
    return { content: [{ type: 'text', text: JSON.stringify(result.data.data ?? {}) }] };
  } catch (error) {
    let failure: PluginError;
    if (signal.aborted) {
      failure =
        isWrite && submitted
          ? unknownWriteError()
          : new PluginError('cancelled', 'Feishu request cancelled.');
    } else if (error instanceof PluginError) {
      failure = error;
    } else if (isHttpError(error)) {
      const code = error.code && /^[0-9]{1,9}$/.test(error.code) ? Number(error.code) : undefined;
      if (error.status === 401)
        failure = new PluginError('authorization', 'Feishu rejected the user credential.');
      else if (error.status === 403)
        failure = new PluginError('access', 'Feishu denied resource or application access.');
      else if (error.status === 429)
        failure = new PluginError('quota', 'Feishu request limit reached.');
      else if (error.status === 408 || (error.status && error.status >= 500))
        failure =
          isWrite && submitted
            ? unknownWriteError()
            : new PluginError('network', 'Feishu request timed out or failed.');
      else if (code) failure = apiError(code, isWrite);
      else if (error.status && error.status < 500)
        failure = new PluginError('request', 'Feishu rejected the request.');
      else if (isWrite && submitted) failure = unknownWriteError();
      else if (error.kind === 'invalid_response')
        failure = new PluginError(
          'request',
          'Feishu response is invalid or too large. Request fewer fields or a smaller page or time window.',
        );
      else failure = new PluginError('network', 'Could not reach Feishu.');
    } else {
      failure =
        isWrite && submitted
          ? unknownWriteError()
          : new PluginError('request', 'Could not prepare the Feishu request.');
    }
    if (failure.reason === 'authorization' && submitted && credential)
      await context.rejectCredential?.(credential).catch(() => undefined);
    // No automatic replay, including token rejection and possibly committed writes.
    throw failure;
  }
}
