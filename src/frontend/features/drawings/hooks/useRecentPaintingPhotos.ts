import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import { canUseDevicePermission } from '@/shared/contracts';

import {
  loadPhotoPreviewPage,
  type PhotoPreview,
  shouldRequestPhotoPreviewAccess,
} from '../utils/photoLibrary';

const recentPhotoLimit = 12;

export type PhotoAccessResult = 'blocked' | 'denied' | 'granted';

export function useRecentPaintingPhotos(enabled: boolean) {
  const permissions = useBackendModule('permissions');
  const [isLoading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const isActiveRef = useRef(false);

  const refresh = useCallback(
    async (isUserInitiated: boolean): Promise<PhotoAccessResult> => {
      if (!enabled) {
        return 'denied';
      }

      try {
        let permission = (await permissions.getStatuses(['photos.read']))['photos.read'];
        if (shouldRequestPhotoPreviewAccess(permission, isUserInitiated)) {
          permission = (await permissions.request(['photos.read']))['photos.read'];
        }
        const granted = canUseDevicePermission('photos.read', permission);
        if (isActiveRef.current) {
          setHasAccess(granted);
        }
        const nextPhotos = granted
          ? (await loadPhotoPreviewPage(0, recentPhotoLimit)).photoPreviews
          : [];
        if (isActiveRef.current) {
          setPhotos(nextPhotos);
          setLoading(false);
        }
        return granted
          ? 'granted'
          : permission?.state === 'denied' && !permission.canAskAgain
            ? 'blocked'
            : 'denied';
      } catch {
        if (isActiveRef.current) {
          setPhotos([]);
          setLoading(false);
        }
        return 'denied';
      }
    },
    [enabled, permissions],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    isActiveRef.current = true;
    queueMicrotask(() => void refresh(false));
    return () => {
      isActiveRef.current = false;
    };
  }, [enabled, refresh]);

  // iOS starts observing by fetching the photo library, which prompts while access is undetermined.
  useEffect(() => {
    if (!enabled || !hasAccess) {
      return;
    }
    const subscription = MediaLibrary.addListener(() => void refresh(false));
    return () => subscription.remove();
  }, [enabled, hasAccess, refresh]);

  const requestAccess = useCallback(() => refresh(true), [refresh]);

  return useMemo(
    () => ({ isLoading: enabled && isLoading, photos, requestAccess }),
    [enabled, isLoading, photos, requestAccess],
  );
}
