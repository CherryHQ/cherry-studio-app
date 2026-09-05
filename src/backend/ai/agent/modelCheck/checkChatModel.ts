import { v4 as uuid } from 'uuid';

import type { ChatModelCheckFailure, ChatModelCheckResult } from '@/shared/contracts/models';
import type { Model } from '@/shared/data/types/model';

import type { AgentRuntime, RuntimeError, RuntimeUsageReport } from '../runtime';

const CHAT_CHECK_TIMEOUT_MS = 20_000;

/** Uses the bound conversation Runtime without creating a transcript or exposing tools. */
export async function checkChatModel(
  runtime: Pick<AgentRuntime, 'open'>,
  model: Model,
  options: {
    onUsage: (report: RuntimeUsageReport, requestId: string) => Promise<void>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<ChatModelCheckResult> {
  options.signal?.throwIfAborted();
  const session = await runtime.open();
  const turnId = uuid();
  const startedAt = performance.now();
  let usage: RuntimeUsageReport | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let timedOut = false;

  try {
    options.signal?.throwIfAborted();
    const events = session.execute({
      contextCheckpoint: null,
      history: [],
      input: [{ type: 'text', text: 'Reply with OK.' }],
      instructions: '',
      model: { modelId: model.modelId, providerId: model.providerId },
      options: { maxOutputTokens: 64, reasoningEffort: 'off' },
      tools: [],
      turnId,
    });
    const consume = async (): Promise<ChatModelCheckResult> => {
      let hasText = false;
      for await (const event of events) {
        if (event.type === 'usage') usage = event;
        if (event.type === 'text.delta' && event.text.trim()) hasText = true;
        if (
          (event.type === 'part.add' || event.type === 'part.replace') &&
          event.part.type === 'text' &&
          event.part.text.trim()
        )
          hasText = true;
        if (event.type === 'failed')
          return { status: 'failed', reason: classifyChatModelFailure(event.error) };
        if (event.type === 'completed')
          return hasText
            ? { status: 'success', latency: performance.now() - startedAt }
            : { status: 'failed', reason: 'model' };
      }
      return { status: 'failed', reason: 'unknown' };
    };
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(options.signal?.reason ?? new Error('Chat model check cancelled'));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      timeout = setTimeout(() => {
        timedOut = true;
        reject(new Error('Chat model check timed out'));
      }, options.timeoutMs ?? CHAT_CHECK_TIMEOUT_MS);
    });
    const result = await Promise.race([consume(), cancelled]);
    options.signal?.throwIfAborted();
    return result;
  } catch {
    options.signal?.throwIfAborted();
    return { status: 'failed', reason: timedOut ? 'timeout' : 'unknown' };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abort) options.signal?.removeEventListener('abort', abort);
    await session.close();
    if (usage) await options.onUsage(usage, `chat-model-check:${turnId}`);
  }
}

export function classifyChatModelFailure(error: RuntimeError): ChatModelCheckFailure {
  const code = error.code.toLowerCase();
  const status = error.context?.statusCode;
  if (status === 401 || code === 'invalid_api_key') return 'authentication';
  if (status === 402 || /quota|credit|billing|balance/.test(code)) return 'quota';
  if (status === 403) return 'permission';
  if (status === 429 || /rate_limit/.test(code)) return 'rateLimit';
  if (status === 408 || status === 504 || /timeout|timed_out/.test(code)) return 'timeout';
  if (status === 404 || /model|unsupported/.test(code)) return 'model';
  if (/network|connection|fetch|econn/.test(code)) return 'network';
  return 'unknown';
}
