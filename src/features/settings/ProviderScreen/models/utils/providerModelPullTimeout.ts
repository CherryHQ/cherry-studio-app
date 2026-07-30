export const providerModelPullTimeoutMs = 10_000;

export class ProviderModelPullTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Pull models timed out after ${timeoutMs}ms`);
    this.name = 'ProviderModelPullTimeoutError';
  }
}

export function isProviderModelPullTimeoutError(
  error: unknown,
): error is ProviderModelPullTimeoutError {
  return error instanceof ProviderModelPullTimeoutError;
}

export async function withProviderModelPullTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = providerModelPullTimeoutMs,
): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new ProviderModelPullTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
