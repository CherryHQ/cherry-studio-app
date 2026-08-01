import type { FileSchemas } from '@cherrystudio/universal/data/api/schemas/files';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';

type FileData = Pick<FileEntryService, 'get' | 'resolve' | 'resolveRenderableUri'>;

export function createFileHandlers(service: FileData): HandlersFor<FileSchemas> {
  return {
    '/files/:id': {
      GET: ({ params }) => service.get(params.id),
    },
    '/files/:id/renderable-uri': {
      GET: async ({ params }) => (await service.resolveRenderableUri(params.id)) ?? null,
    },
    '/files/:id/resolved': {
      GET: ({ params }) => service.resolve(params.id),
    },
  };
}
