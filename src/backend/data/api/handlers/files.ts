import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileSchemas } from '@cherrystudio/shared/data/api/schemas/files';
import type { HandlersFor } from '@cherrystudio/shared/data/api/types';

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
