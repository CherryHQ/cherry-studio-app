/**
 * Every DB-backed preference the mobile app has.
 *
 * Hand-maintained. This used to be generated from desktop's classification.json
 * and carried all 244 desktop keys; mobile preference data is independent of
 * desktop, so a key belongs here only when mobile code reads it.
 *
 * Key naming: `namespace.sub.key_name` — at least two dot-separated segments,
 * each lowercase letters, digits, or underscores. Desktop enforces this with
 * its `data-schema-key/valid-key` ESLint rule, which does not run here; the
 * shape is asserted in `__tests__/preferenceUtils.test.ts` instead.
 */

import type {
  WebSearchCompressionMethod,
  WebSearchProviderId,
  WebSearchProviderOverrides,
} from '@/shared/data/types/webSearch';

import type { LanguageVarious } from './preferenceTypes';
import { ThemeMode } from './preferenceTypes';

export const FONT_SIZE_STEPS = [0, 1, 2] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

export interface PreferenceSchema {
  'app.language': LanguageVarious | null;
  /** `avatar-file:{uuid}.webp` for a managed avatar image, or a direct image URI. */
  'app.user.avatar': string;
  'app.user.name': string;

  'chat.background_reply.enabled': boolean;
  'agent.default_model_id': string | null;
  'chat.web_search.compression.cutoff_limit': number;
  'chat.web_search.compression.method': WebSearchCompressionMethod;
  'chat.web_search.default_fetch_urls_provider': WebSearchProviderId;
  'chat.web_search.default_search_keywords_provider': WebSearchProviderId;
  'chat.web_search.max_results': number;
  'chat.web_search.provider_overrides': WebSearchProviderOverrides;

  'feature.paintings.default_model_id': string | null;
  'feature.quick_assistant.model_id': string | null;
  'feature.translate.model_id': string | null;

  'agent.session_naming.enabled': boolean;
  'agent.session_naming.model_id': string | null;
  'agent.session_naming.prompt': string;

  'ui.font_size_step': FontSizeStep;
  'ui.theme_mode': ThemeMode;
}

export const PreferenceDefaults = {
  'app.language': null,
  'app.user.avatar': '',
  'app.user.name': '',

  'chat.background_reply.enabled': true,
  'agent.default_model_id': null,
  'chat.web_search.compression.cutoff_limit': 2000,
  'chat.web_search.compression.method': 'none',
  'chat.web_search.default_fetch_urls_provider': 'jina',
  'chat.web_search.default_search_keywords_provider': 'exa-mcp',
  'chat.web_search.max_results': 5,
  'chat.web_search.provider_overrides': {},

  'feature.paintings.default_model_id': null,
  'feature.quick_assistant.model_id': null,
  'feature.translate.model_id': null,

  'agent.session_naming.enabled': true,
  'agent.session_naming.model_id': null,
  'agent.session_naming.prompt': '',

  'ui.font_size_step': 0,
  'ui.theme_mode': ThemeMode.system,
} satisfies PreferenceSchema;

export type PreferenceKeyType = keyof PreferenceSchema;
