import { AxiosHeaders, type AxiosResponse, type RawAxiosHeaders } from 'axios';

import type { HttpHeaders } from './HttpClient';

export function toHttpHeaders(headers: AxiosResponse<unknown>['headers']): HttpHeaders {
  const result: Record<string, string> = {};

  const normalized = AxiosHeaders.from(headers as AxiosHeaders | RawAxiosHeaders).toJSON(true);
  for (const [name, value] of Object.entries(normalized)) {
    result[name.toLowerCase()] = value;
  }

  return Object.freeze(result);
}
