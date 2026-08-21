import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { Painting } from '@/shared/data/types/painting';

export type PaintingListQuery = {
  cursor?: string;
  limit?: number;
};

export type PaintingSchemas = {
  '/paintings': {
    DELETE: {
      query: { ids: readonly string[] };
      response: undefined;
    };
    GET: {
      query?: PaintingListQuery;
      response: CursorPaginationResponse<Painting>;
    };
  };
  '/paintings/ids': {
    GET: {
      response: string[];
    };
  };
  '/paintings/:id': {
    GET: {
      params: { id: string };
      response: Painting;
    };
  };
};
