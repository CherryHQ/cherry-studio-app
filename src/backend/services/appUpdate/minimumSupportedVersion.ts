import { createMMKV } from 'react-native-mmkv';
import { z } from 'zod';

import { createHttpClient } from '@/backend/services/http';

import { compareReleaseVersions, parseReleaseVersion } from './releaseVersion';

const KEY = 'mobile.minSupportedVersion';
const configResponse = z.object({ configs: z.object({ [KEY]: z.string().optional() }) });
const http = createHttpClient({
  baseUrl: 'https://api.cherry-ai.com',
  serviceName: 'AppUpdate',
  operation: 'mobile.configs',
  timeoutMs: 10_000,
});

export function createMinimumVersionPolicy(installed: string | null, lifetime: AbortSignal) {
  // The native installation and its minimum version are shared across account profiles.
  const store = createMMKV({ id: 'cherry-installation-config' });

  async function checkRequiredVersion(): Promise<string | null> {
    if (!installed) return null;
    let minimum: string | undefined;
    try {
      const { data } = await http.request<unknown>({
        method: 'GET',
        path: '/api/configs',
        query: { product: 'mobile' },
        credentials: 'omit',
        redirect: 'error',
        maxResponseBytes: 1024 * 1024,
        signal: lifetime,
      });
      lifetime.throwIfAborted();
      minimum = configResponse.parse(data).configs[KEY];
      if (minimum === undefined) {
        store.remove(KEY);
      } else {
        parseReleaseVersion(minimum);
        store.set(KEY, minimum);
      }
    } catch {
      lifetime.throwIfAborted();
      minimum = store.getString(KEY);
    }
    return minimum && compareReleaseVersions(installed, minimum) < 0 ? minimum : null;
  }
  return { checkRequiredVersion };
}
