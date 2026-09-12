export type WebSearchConfigErrorCode =
  | 'provider_not_configured'
  | 'provider_unknown'
  | 'capability_unsupported'
  | 'api_key_missing'
  | 'api_host_missing'
  | 'api_host_invalid'
  /**
   * Mobile-only, keep on desktop sync. Distinct from `capability_unsupported`:
   * the provider does declare the capability, but its implementation needs a
   * platform capability this runtime lacks. Retrying can never help, so it has
   * to be terminal rather than a plain Error.
   */
  | 'provider_unsupported_on_platform';

/** A web-search request that cannot succeed until the user changes configuration. */
export class WebSearchConfigError extends Error {
  constructor(
    public readonly code: WebSearchConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WebSearchConfigError';
  }
}
