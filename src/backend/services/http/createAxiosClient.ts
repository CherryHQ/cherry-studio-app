import { create as createAxiosInstance, type AxiosInstance, type CreateAxiosDefaults } from 'axios';
import { fetch as expoFetch } from 'expo/fetch';

import { HttpError } from './HttpError';

const DEFAULT_TIMEOUT_MS = 30_000;

type AxiosFetch = NonNullable<NonNullable<CreateAxiosDefaults['env']>['fetch']>;

export type CreateAxiosClientOptions = Omit<
  CreateAxiosDefaults,
  'adapter' | 'allowAbsoluteUrls' | 'baseURL' | 'env'
> & {
  baseURL: string;
};

function assertValidBaseUrl(baseURL: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseURL);
  } catch {
    throw new HttpError('HTTP client base URL is invalid.', {
      code: 'INVALID_BASE_URL',
      kind: 'internal',
    });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new HttpError('HTTP client base URL must use HTTP or HTTPS.', {
      code: 'INVALID_BASE_URL',
      kind: 'internal',
    });
  }
}

function assertValidRequestPath(path: string | undefined): void {
  if (!path?.startsWith('/') || path.startsWith('//')) {
    throw new HttpError('HTTP request path must be a relative API path beginning with `/`.', {
      code: 'INVALID_REQUEST_PATH',
      kind: 'internal',
    });
  }
}

function assertExpectedBaseUrl(baseURL: string | undefined, expectedBaseURL: string): void {
  if (baseURL !== expectedBaseURL) {
    throw new HttpError('HTTP request cannot override the client base URL.', {
      code: 'INVALID_BASE_URL_OVERRIDE',
      kind: 'internal',
    });
  }
}

/**
 * Creates one Axios instance for one backend service or security domain.
 * Domain clients may install their own interceptors; callers outside that
 * domain should depend on the domain client rather than this instance.
 */
export function createAxiosClient(options: CreateAxiosClientOptions): AxiosInstance {
  const baseURL = options.baseURL;
  assertValidBaseUrl(baseURL);

  const instance = createAxiosInstance({
    ...options,
    adapter: 'fetch',
    allowAbsoluteUrls: false,
    baseURL,
    env: {
      fetch: expoFetch as unknown as AxiosFetch,
    },
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  });

  // Axios runs request interceptors in reverse registration order. Keeping the
  // guards on the instance means they also check routing rewritten by later
  // domain interceptors before credentials can reach the adapter.
  instance.interceptors.request.use((config) => {
    assertExpectedBaseUrl(config.baseURL, baseURL);
    assertValidRequestPath(config.url);
    return config;
  });

  return instance;
}
