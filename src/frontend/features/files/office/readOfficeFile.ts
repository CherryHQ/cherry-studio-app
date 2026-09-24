import { File, FileMode } from 'expo-file-system';

import type { BuiltinOfficeFileType } from '@/shared/utils/documentFileTypes';

import { isOfficeChunkRange, officeSourceLimit } from './officePreview';

/** No path, URL, or write operation is exposed to the document's WebView. */
export function createOfficeFileReader(uri: string, type: BuiltinOfficeFileType) {
  const limit = officeSourceLimit(type);
  let size: number | undefined;
  let modificationTime: number | undefined;
  let nextOffset = 0;
  let disposed = false;
  return {
    dispose() {
      disposed = true;
    },
    async getSize(): Promise<number> {
      if (disposed) throw new Error('Office preview closed');
      const info = new File(uri).info();
      if (!info.exists || !info.size) throw new Error('Office file unavailable');
      if (info.size > limit) return -1;
      size = info.size;
      modificationTime = info.modificationTime;
      nextOffset = 0;
      return size;
    },
    async readChunk(offset: number, length: number): Promise<string> {
      if (
        disposed ||
        size === undefined ||
        offset !== nextOffset ||
        !isOfficeChunkRange(offset, length, size)
      ) {
        throw new Error('Invalid Office read range');
      }
      const source = new File(uri);
      const info = source.info();
      if (info.size !== size || info.modificationTime !== modificationTime)
        throw new Error('Office file changed');
      const handle = source.open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        const bytes = handle.readBytes(length);
        if (bytes.length !== length) throw new Error('Incomplete Office read');
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        nextOffset += length;
        return btoa(binary);
      } finally {
        handle.close();
      }
    },
  };
}
