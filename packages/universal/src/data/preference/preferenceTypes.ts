/**
 * Value types for the preference keys in `preferenceSchema.ts`, plus the
 * web-search provider vocabulary those keys are written in.
 */

export type PreferenceUpdateOptions = {
  optimistic: boolean;
};

export type PermissionMode = 'never' | 'ask' | 'always';

export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  system = 'system',
}

/** 有限的UI语言 */
export type LanguageVarious =
  | 'zh-CN'
  | 'zh-TW'
  | 'de-DE'
  | 'el-GR'
  | 'en-US'
  | 'es-ES'
  | 'fr-FR'
  | 'ja-JP'
  | 'pt-PT'
  | 'ro-RO'
  | 'ru-RU'
  | 'vi-VN';

// ============================================================================
// WebSearch Types
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
  capabilities: Array<{
    feature: WebSearchCapability;
    /** Can be empty for self-hosted or hostless providers; resolve and validate via resolveProviderApiHost. */
    apiHost?: string;
  }>;
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
