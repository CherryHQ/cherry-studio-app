import type { ContentSearchService } from '@/backend/data/services/ContentSearchService';
import type { EntitySearchService } from '@/backend/data/services/EntitySearchService';
import { toDataApiError } from '@/shared/data/api/errors';
import {
  ContentSearchQuerySchema,
  EntitySearchQuerySchema,
  type SearchSchemas,
} from '@/shared/data/api/schemas/search';
import type { HandlersFor } from '@/shared/data/api/types';

export function createSearchHandlers(
  contentSearch: ContentSearchService,
  entitySearch: EntitySearchService,
): HandlersFor<SearchSchemas> {
  return {
    '/search/entities': {
      GET: async ({ query }) => {
        const parsed = EntitySearchQuerySchema.safeParse(query);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return await entitySearch.search(parsed.data);
      },
    },
    '/search/contents': {
      GET: async ({ query }) => {
        const parsed = ContentSearchQuerySchema.safeParse(query);
        if (!parsed.success) throw toDataApiError(parsed.error);
        return await contentSearch.search(parsed.data);
      },
    },
  };
}
