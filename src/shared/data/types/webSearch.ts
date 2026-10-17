import type {
  WebSearchCapability as SharedWebSearchCapability,
  WebSearchErrorKind,
  WebSearchResult as SharedWebSearchResult,
} from '@cherrystudio/web-search';

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
  'crawl4ai',
  'parallel',
  'serply',
] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export const WEB_SEARCH_CAPABILITIES = ['searchKeywords', 'fetchUrls'] as const;

export type WebSearchCapability = SharedWebSearchCapability;

export type WebSearchProviderFeatureCapability = {
  feature: WebSearchCapability;
  /** The capability cannot run until a valid HTTP(S) host is set. */
  requiresApiHost: boolean;
  /** The capability cannot run without an API key; `false` means a key is optional or unused. */
  requiresApiKey: boolean;
  /** Absent for hostless providers; empty when the user must supply their own instance. */
  apiHost?: string;
};

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
  capabilities: WebSearchProviderFeatureCapability[];
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
  -readonly [Key in keyof SharedWebSearchResult]: SharedWebSearchResult[Key];
};

export type WebSearchFailure = {
  input: string;
  kind: Exclude<WebSearchErrorKind, 'cancelled'>;
  message: string;
  code?: string;
  status?: number;
};

export type WebSearchResponse = {
  query?: string;
  providerId: WebSearchProviderId;
  capability: WebSearchCapability;
  inputs: string[];
  results: WebSearchResult[];
  /** Failed inputs are retained even when other inputs succeeded. */
  failures?: WebSearchFailure[];
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
  providerId: WebSearchProviderId;
  capability: WebSearchCapability;
  /** Unsaved settings to check in place of the stored override. */
  override?: WebSearchProviderOverride;
};

export type WebSearchCheckProviderResponse = {
  valid: boolean;
  error?: string;
};

export type WebSearchCompressionConfig = {
  /** Keyword-search policy; page fetches have independent mandatory limits. */
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
