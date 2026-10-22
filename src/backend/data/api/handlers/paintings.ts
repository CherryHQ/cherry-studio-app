import { application } from '@/backend/core/application/Application';
import type { PaintingService } from '@/backend/data/services/PaintingService';
import type { PaintingSchemas } from '@/shared/data/api/schemas/paintings';
import type { HandlersFor } from '@/shared/data/api/types';

export function createPaintingHandlers(service: PaintingService): HandlersFor<PaintingSchemas> {
  return {
    '/paintings': {
      // Cancels and drains the generate jobs writing through these receipts
      // first. Until now that only happened when the frontend remembered to call
      // the cancel hook before deleting; every caller gets it here.
      DELETE: ({ query }) =>
        application.get('ResourceScopeCoordinator').delete(
          query.ids.map((id) => ({ id, kind: 'painting' })),
          () => service.deleteMany(query.ids),
        ),
    },
    '/paintings/:id': {
      GET: ({ params }) => service.getById(params.id),
    },
    '/paintings/by-output/:fileEntryId': {
      GET: ({ params }) => service.findByOutputFile(params.fileEntryId),
    },
    '/painting-boards': {
      GET: ({ query }) => service.listBoardsByCursor(query),
    },
    '/painting-boards/:id': {
      // Fence the parent before waiting; new children cannot escape a stale snapshot.
      DELETE: ({ params }) =>
        application
          .get('ResourceScopeCoordinator')
          .delete([{ id: params.id, kind: 'painting-board' }], () =>
            service.deleteBoard(params.id),
          ),
      GET: ({ params }) => service.getBoard(params.id),
      PATCH: ({ body, params }) => service.updateBoard(params.id, body),
    },
    '/painting-boards/:id/paintings': {
      GET: ({ params }) => service.listByBoard(params.id),
    },
  };
}
