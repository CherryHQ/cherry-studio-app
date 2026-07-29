import type { WebSearchService } from '@/services/webSearch/WebSearchService';

import {
  createWebSearchTool,
  WEB_SEARCH_DESCRIPTION,
  WEB_SEARCH_TOOL_NAME,
} from '../../createWebSearchTool';
import type { ToolEntry } from '../types';

export function createWebSearchToolEntry(webSearch: WebSearchService): ToolEntry {
  return {
    applies: (scope) => scope.externalWebSearchEnabled,
    defer: 'auto',
    description: WEB_SEARCH_DESCRIPTION,
    name: WEB_SEARCH_TOOL_NAME,
    namespace: 'web',
    tool: createWebSearchTool(webSearch),
  };
}
