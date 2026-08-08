import type { FileEntry } from '@cherrystudio/universal/data/types/file';
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  getQuickLookThumbnail,
  quickLookThumbnailCacheKey,
  type QuickLookThumbnailInput,
} from './quickLookThumbnailCache.ios';

const logger = loggerService.withContext('useQuickLookThumbnail');

type ThumbnailState = {
  key: string;
  uri?: string;
};

export function useQuickLookThumbnail({
  entry,
  height,
  uri,
  width,
}: {
  entry: FileEntry;
  height: number;
  uri: string;
  width: number;
}) {
  const scale = PixelRatio.get();
  const input: QuickLookThumbnailInput = {
    entryId: entry.id,
    height,
    scale,
    updatedAt: entry.updatedAt,
    uri,
    width,
  };
  const key = quickLookThumbnailCacheKey(input);
  const [thumbnail, setThumbnail] = useState<ThumbnailState>({ key });

  useEffect(() => {
    let active = true;
    void getQuickLookThumbnail({
      entryId: entry.id,
      height,
      scale,
      updatedAt: entry.updatedAt,
      uri,
      width,
    })
      .then((thumbnailUri) => {
        if (active) {
          setThumbnail({ key, uri: thumbnailUri });
        }
      })
      .catch((error) => {
        logger.warn('Failed to generate Quick Look thumbnail', toError(error), {
          entryId: entry.id,
        });
      });
    return () => {
      active = false;
    };
  }, [entry.id, entry.updatedAt, height, key, scale, uri, width]);

  return thumbnail.key === key ? thumbnail.uri : undefined;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
