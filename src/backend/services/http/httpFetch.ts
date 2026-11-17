import { AxiosError, type CreateAxiosDefaults, type InternalAxiosRequestConfig } from 'axios';
import { fetch as expoFetch } from 'expo/fetch';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { raceAbort } from '@/backend/utils/raceAbort';

import { readHttpText } from './readHttpText';

type AxiosFetch = NonNullable<NonNullable<CreateAxiosDefaults['env']>['fetch']>;
const nativeFetch = expoFetch as unknown as AxiosFetch;

export const HTTP_TEXT_RESPONSE_LIMIT = Symbol('httpTextResponseLimit');

/** Axios deep-merges plain options; an instance preserves this request's result across that merge. */
export class HttpTextResponseLimit {
  truncated = false;

  constructor(
    readonly maxBytes: number,
    readonly timeoutMs: number,
    readonly errorConfig: InternalAxiosRequestConfig,
  ) {}
}

export type HttpFetchOptions = RequestInit & {
  [HTTP_TEXT_RESPONSE_LIMIT]?: HttpTextResponseLimit;
};

/** The shared transport's fetch boundary, including native body consumption when it is bounded. */
export const httpFetch: AxiosFetch = async (input, init) => {
  const { [HTTP_TEXT_RESPONSE_LIMIT]: limit, ...options } = (init ?? {}) as HttpFetchOptions;
  if (!limit) return nativeFetch(input, options);

  const controller = new AbortController();
  const parent =
    options.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
  const linked = linkAbortSignals(parent ? [parent, controller.signal] : [controller.signal]);
  const timer = setTimeout(
    () =>
      controller.abort(
        new AxiosError('HTTP request timed out.', AxiosError.ETIMEDOUT, limit.errorConfig),
      ),
    limit.timeoutMs,
  );

  try {
    linked.signal.throwIfAborted();
    const response = await raceAbort(
      nativeFetch(input, { ...options, signal: linked.signal }),
      linked.signal,
    );
    const bounded = await readHttpText(response.body, limit.maxBytes, linked.signal);
    limit.truncated = bounded.truncated;
    const headers = response.headers;
    // RN's global Response can represent text but not streams. Consume Expo's actual native body
    // before returning a finite text response to Axios, bypassing its global stream feature probe.
    const textResponse = new Response(
      [204, 205, 304].includes(response.status) ? null : bounded.text,
      {
        status: response.status,
        statusText: response.statusText,
        headers,
      },
    );
    // Constructing a text Response can add a default Content-Type that was absent on the wire.
    if (!headers.has('content-type')) textResponse.headers.delete('content-type');
    return textResponse;
  } finally {
    clearTimeout(timer);
    // Expo's reader.cancel() can stop JS events without cancelling the native URLSession task.
    // This child signal owns native I/O only, so stopping it does not cancel the caller's result.
    controller.abort();
    linked.dispose();
  }
};
