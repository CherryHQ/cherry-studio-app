import { toDataApiError } from '@cherrystudio/universal/data/api/errors';
import {
  ContentSearchQuerySchema,
  EntitySearchQuerySchema,
  type SearchSchemas,
} from '@cherrystudio/universal/data/api/schemas/search';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { ContentSearchService } from '@/backend/data/services/ContentSearchService';
import type { EntitySearchService } from '@/backend/data/services/EntitySearchService';

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
