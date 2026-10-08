import type { LucideIconComponent } from '@cherrystudio/app-icons';
import LinkIcon from '@cherrystudio/app-icons/icons/link';
import SearchIcon from '@cherrystudio/app-icons/icons/search';

import type { WebSearchCapability } from '@/shared/data/types/webSearch';

export type BuiltinToolId = 'fetchUrls' | 'webSearch';

type BuiltinTool = {
  capability: WebSearchCapability;
  glyph: LucideIconComponent;
  nameKey: 'plugins.builtinTools.fetchUrls.name' | 'plugins.builtinTools.webSearch.name';
  pathname: '/plugins/tools/fetch-urls' | '/plugins/tools/web-search';
  providerLabelKey:
    | 'settings.websearch.fetchUrlsProvider'
    | 'settings.websearch.provider.selection';
  summaryKey: 'plugins.builtinTools.fetchUrls.summary' | 'plugins.builtinTools.webSearch.summary';
};

/** Application-owned tools listed beside plugins; each is backed by one web search capability. */
export const BUILTIN_TOOLS = {
  webSearch: {
    capability: 'searchKeywords',
    glyph: SearchIcon,
    nameKey: 'plugins.builtinTools.webSearch.name',
    pathname: '/plugins/tools/web-search',
    providerLabelKey: 'settings.websearch.provider.selection',
    summaryKey: 'plugins.builtinTools.webSearch.summary',
  },
  fetchUrls: {
    capability: 'fetchUrls',
    glyph: LinkIcon,
    nameKey: 'plugins.builtinTools.fetchUrls.name',
    pathname: '/plugins/tools/fetch-urls',
    providerLabelKey: 'settings.websearch.fetchUrlsProvider',
    summaryKey: 'plugins.builtinTools.fetchUrls.summary',
  },
} as const satisfies Record<BuiltinToolId, BuiltinTool>;

export const BUILTIN_TOOL_IDS = [
  'webSearch',
  'fetchUrls',
] as const satisfies readonly BuiltinToolId[];
