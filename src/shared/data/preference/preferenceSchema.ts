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

import {
  DEFAULT_DOCUMENT_PARSER_MODE,
  type DocumentParserMode,
} from '@/shared/contracts/fileAttachment';
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
  'app.onboarding.status': 'unseen' | 'pending' | 'skipped' | 'completed';
  /** Opt-out switch for anonymous product analytics. Only honoured under the current policy. */
  'app.privacy.data_collection.enabled': boolean;
  /**
   * Disclosure the user was last shown. Both consent answers record it, so whether
   * collection runs is carried by the switch above; anything but the latest version
   * revokes collection and asks again.
   */
  'app.privacy.policy_version': string;
  /** `avatar-file:{uuid}.webp` for a managed avatar image, or a direct image URI. */
  'app.user.avatar': string;
  /**
   * Analytics client identity (UUID). Generated on first use, and replaced by the
   * desktop's own identity when this device pairs with a computer.
   */
  'app.user.id': string;
  'app.user.name': string;

  /** Also gates all iOS Live Activity surfaces, including painting; keep the persisted key. */
  'chat.background_reply.enabled': boolean;
  'chat.completion_notifications.enabled': boolean;
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

  'file.document_parser.mode': DocumentParserMode;
  'file.export.watermark_enabled': boolean;

  'agent.session_naming.enabled': boolean;
  'agent.session_naming.model_id': string | null;
  'agent.session_naming.prompt': string;

  'ui.font_size_step': FontSizeStep;
  'ui.library.view_mode': 'grid' | 'list';
  'ui.sidebar.recent_view_mode': 'agents' | 'sessions';
  'ui.theme_mode': ThemeMode;
}

export const PreferenceDefaults = {
  'app.language': null,
  'app.onboarding.status': 'unseen',
  'app.privacy.data_collection.enabled': true,
  // Empty until the consent sheet records a choice, so nothing is collected before
  // the disclosure is shown. A later policy bump leaves stored installs behind the
  // current version and shows the sheet again.
  'app.privacy.policy_version': '',
  'app.user.avatar': '',
  'app.user.id': '',
  'app.user.name': '',

  'chat.background_reply.enabled': true,
  'chat.completion_notifications.enabled': true,
  'agent.default_model_id': null,
  'chat.web_search.compression.cutoff_limit': 2000,
  'chat.web_search.compression.method': 'cutoff',
  'chat.web_search.default_fetch_urls_provider': 'jina',
  'chat.web_search.default_search_keywords_provider': 'exa-mcp',
  'chat.web_search.max_results': 5,
  'chat.web_search.provider_overrides': {},

  'feature.paintings.default_model_id': null,
  'feature.quick_assistant.model_id': null,
  'feature.translate.model_id': null,

  'file.document_parser.mode': DEFAULT_DOCUMENT_PARSER_MODE,
  'file.export.watermark_enabled': true,

  'agent.session_naming.enabled': true,
  'agent.session_naming.model_id': null,
  'agent.session_naming.prompt': '',

  'ui.font_size_step': 0,
  'ui.library.view_mode': 'grid',
  'ui.sidebar.recent_view_mode': 'sessions',
  'ui.theme_mode': ThemeMode.system,
} satisfies PreferenceSchema;

export type PreferenceKeyType = keyof PreferenceSchema;

/**
 * Preferences that describe this device or its consent rather than the user's content.
 * Restoring a backup keeps the target device's values for these keys.
 */
export const DEVICE_LOCAL_PREFERENCE_KEYS = [
  'app.onboarding.status',
  'app.privacy.data_collection.enabled',
  'app.privacy.policy_version',
  'app.user.id',
  'chat.background_reply.enabled',
  'chat.completion_notifications.enabled',
] as const satisfies readonly PreferenceKeyType[];
