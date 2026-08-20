import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';

import type { FilePreviewFile, FilePreviewOperation } from '../file-preview.types';
import {
  getQuickLookThumbnail,
  quickLookThumbnailCacheKey,
  type QuickLookThumbnailInput,
} from '../utils/quick-look-thumbnail-cache.ios';

type ThumbnailState = {
  key: string;
  uri?: string;
};

export function useQuickLookThumbnail({
  file,
  height,
  onError,
  width,
}: {
  file: FilePreviewFile;
  height: number;
  onError?: (error: Error, operation: FilePreviewOperation) => void;
  width: number;
}) {
  const scale = PixelRatio.get();
  const input: QuickLookThumbnailInput = {
    height,
    id: file.id,
    revision: file.revision,
    scale,
    uri: file.uri,
    width,
  };
  const key = quickLookThumbnailCacheKey(input);
  const [thumbnail, setThumbnail] = useState<ThumbnailState>({ key });

  useEffect(() => {
    let active = true;
    void getQuickLookThumbnail({
      height,
      id: file.id,
      revision: file.revision,
      scale,
      uri: file.uri,
      width,
    })
      .then((thumbnailUri) => {
        if (active) {
          setThumbnail({ key, uri: thumbnailUri });
        }
      })
      .catch((error) => {
        onError?.(toError(error), 'thumbnail');
      });
    return () => {
      active = false;
    };
  }, [file.id, file.revision, file.uri, height, key, onError, scale, width]);

  return thumbnail.key === key ? thumbnail.uri : undefined;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
