export function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}

/** Configuration failures that cannot succeed until the user changes Web Search settings. */
export function isPermanentWebSearchConfigError(message: string): boolean {
  return /is not configured for capability|does not (support|implement) capability|Unknown web search provider|is not supported on mobile/i.test(
    message,
  );
}
