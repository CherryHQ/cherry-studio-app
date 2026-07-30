import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileSchemas } from '@/shared/data/api/schemas/files';
import type { HandlersFor } from '@/shared/data/api/types';

type FileData = Pick<FileEntryService, 'get' | 'resolve' | 'resolveRenderableUri'>;

export function createFileHandlers(service: FileData): HandlersFor<FileSchemas> {
  return {
    '/files/:id': {
      GET: ({ params }) => service.get(params.id),
    },
    '/files/:id/renderable-uri': {
      GET: ({ params }) => service.resolveRenderableUri(params.id),
    },
    '/files/:id/resolved': {
      GET: ({ params }) => service.resolve(params.id),
    },
  };
}
