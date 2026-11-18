import type { LucideIconComponent } from '@cherrystudio/app-icons';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import LinkIcon from '@cherrystudio/app-icons/icons/link';
import SearchIcon from '@cherrystudio/app-icons/icons/search';

import type { WebSearchCapability } from '@/shared/data/types/webSearch';

export type BuiltinToolId = 'fetchUrls' | 'webSearch' | 'documentParser' | 'ocr';

type BuiltinTool = {
  capability?: WebSearchCapability;
  glyph: LucideIconComponent;
  nameKey: `plugins.builtinTools.${BuiltinToolId}.name`;
  pathname:
    | '/plugins/tools/fetch-urls'
    | '/plugins/tools/web-search'
    | '/plugins/tools/document-parser'
    | '/plugins/tools/ocr';
  providerLabelKey?:
    | 'settings.websearch.fetchUrlsProvider'
    | 'settings.websearch.provider.selection';
  summaryKey: `plugins.builtinTools.${BuiltinToolId}.summary`;
};

/** Application-owned capability settings listed beside installed plugins. */
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
  documentParser: {
    glyph: FileTextIcon,
    nameKey: 'plugins.builtinTools.documentParser.name',
    pathname: '/plugins/tools/document-parser',
    summaryKey: 'plugins.builtinTools.documentParser.summary',
  },
  ocr: {
    glyph: ImageIcon,
    nameKey: 'plugins.builtinTools.ocr.name',
    pathname: '/plugins/tools/ocr',
    summaryKey: 'plugins.builtinTools.ocr.summary',
  },
} as const satisfies Record<BuiltinToolId, BuiltinTool>;

export const BUILTIN_TOOL_IDS = [
  'webSearch',
  'fetchUrls',
  'documentParser',
  'ocr',
] as const satisfies readonly BuiltinToolId[];
