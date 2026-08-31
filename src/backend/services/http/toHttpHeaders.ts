import { AxiosHeaders, type AxiosResponse } from 'axios';

import type { HttpHeaders } from './HttpClient';

export function toHttpHeaders(headers: AxiosResponse<unknown>['headers']): HttpHeaders {
  const result: Record<string, string> = {};

  AxiosHeaders.from(headers).forEach((value, name) => {
    result[name.toLowerCase()] = String(value);
  });

  return Object.freeze(result);
}
