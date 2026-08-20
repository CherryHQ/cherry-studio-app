// ============================================================================
// Provider Vocabulary
// ============================================================================

export const WEB_SEARCH_PROVIDER_TYPES = ['api', 'mcp'] as const;

export type WebSearchProviderType = (typeof WEB_SEARCH_PROVIDER_TYPES)[number];

export const WEB_SEARCH_PROVIDER_IDS = [
  'zhipu',
  'tavily',
  'searxng',
  'exa',
  'exa-mcp',
  'bocha',
  'querit',
  'fetch',
  'jina',
  'firecrawl',
] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export const WEB_SEARCH_CAPABILITIES = ['searchKeywords', 'fetchUrls'] as const;

export type WebSearchCapability = (typeof WEB_SEARCH_CAPABILITIES)[number];

export type WebSearchProviderCapabilityOverride = {
  apiHost?: string;
};

export type WebSearchProviderCapabilityOverrides = Partial<
  Record<WebSearchCapability, WebSearchProviderCapabilityOverride>
>;

export type WebSearchProviderOverride = {
  apiKeys?: string[];
  capabilities?: WebSearchProviderCapabilityOverrides;
  engines?: string[];
  basicAuthUsername?: string;
  basicAuthPassword?: string;
};

export type WebSearchProviderOverrides = Partial<
  Record<WebSearchProviderId, WebSearchProviderOverride>
>;

/**
 * Full WebSearch Provider configuration
 * Generated at runtime by merging preset with user overrides
 */
export interface WebSearchProvider {
  /** Unique provider identifier */
  id: WebSearchProviderId;
  /** Display name (from preset) */
  name: string;
  /** Provider type (from preset) */
  type: WebSearchProviderType;
  /** API keys (from user overrides) */
  apiKeys: string[];
  /** Capability API settings (user override merged into preset capabilities) */
  capabilities: {
    feature: WebSearchCapability;
    /** Can be empty for self-hosted or hostless providers; resolve and validate via resolveProviderApiHost. */
    apiHost?: string;
  }[];
  /** Search engines (from user overrides) */
  engines: string[];
  /** Basic auth username (from user overrides) */
  basicAuthUsername: string;
  /** Basic auth password (from user overrides) */
  basicAuthPassword: string;
}

/**
 * Compression method type
 * Stored in chat.web_search.compression.method
 */
export type WebSearchCompressionMethod = 'none' | 'cutoff';

// ============================================================================
// Runtime Config And Wire Types
// ============================================================================

export const DEFAULT_WEB_SEARCH_CUTOFF_LIMIT = 2000;

export function normalizeWebSearchCutoffLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_WEB_SEARCH_CUTOFF_LIMIT;
}

export type WebSearchResult = {
  title: string;
  content: string;
  url: string;
  sourceInput: string;
};

export type WebSearchResponse = {
  query?: string;
  providerId: WebSearchProviderId;
  capability: WebSearchCapability;
  inputs: string[];
  results: WebSearchResult[];
};

export type WebSearchSearchKeywordsRequest = {
  providerId?: WebSearchProviderId;
  keywords: string[];
};

export type WebSearchFetchUrlsRequest = {
  providerId?: WebSearchProviderId;
  urls: string[];
};

export type WebSearchCheckProviderRequest = {
  provider: WebSearchProvider;
  capability?: WebSearchCapability;
};

export type WebSearchCheckProviderResponse = {
  valid: boolean;
  error?: string;
};

export type WebSearchCompressionConfig = {
  method: WebSearchCompressionMethod;
  cutoffLimit: number;
};

export type WebSearchExecutionConfig = {
  maxResults: number;
  compression: WebSearchCompressionConfig;
};

export type WebSearchResolvedConfig = {
  providers: WebSearchProvider[];
  runtime: WebSearchExecutionConfig;
  providerOverrides: WebSearchProviderOverrides;
};
