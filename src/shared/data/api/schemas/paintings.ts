import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type {
  Painting,
  PaintingBoard,
  PaintingBoardSummary,
  UpdatePaintingBoardDto,
} from '@/shared/data/types/painting';

export type PaintingBoardListQuery = {
  cursor?: string;
  limit?: number;
};

export type PaintingSchemas = {
  '/paintings': {
    DELETE: {
      query: { ids: readonly string[] };
      response: undefined;
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
  /** Most recently touched first: a generation, a rename, or moving the focus all count. */
  '/painting-boards': {
    GET: {
      query?: PaintingBoardListQuery;
      response: CursorPaginationResponse<PaintingBoardSummary>;
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
