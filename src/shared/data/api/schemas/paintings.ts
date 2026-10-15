import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { Painting, PaintingBoard, UpdatePaintingBoardDto } from '@/shared/data/types/painting';

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
  /** The painting whose outputs include this file, or null when none does. */
  '/paintings/by-output/:fileEntryId': {
    GET: {
      params: { fileEntryId: string };
      response: Painting | null;
    };
  };
  '/painting-boards/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: PaintingBoard;
    };
    PATCH: {
      body: UpdatePaintingBoardDto;
      params: { id: string };
      response: PaintingBoard;
    };
  };
  /** Every painting on the board, oldest first. */
  '/painting-boards/:id/paintings': {
    GET: {
      params: { id: string };
      response: Painting[];
    };
  };
};
