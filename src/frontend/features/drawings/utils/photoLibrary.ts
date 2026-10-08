import * as MediaLibrary from 'expo-media-library';

import { canRequestDevicePermission, type DevicePermissionStatus } from '@/shared/contracts';

/**
 * Reading the photo library directly, for the drawing list's recent-photos
 * strip. Picking photos goes through the system picker instead; this is only
 * for showing a few of them inline, which no picker will do.
 *
 * It used to live in the chat input, back when that drew its own photo grid.
 */
export type PhotoPreview = {
  fileName: string;
  id: string;
  uri: string;
};

export function shouldRequestPhotoPreviewAccess(
  permission: DevicePermissionStatus | undefined,
  isUserInitiated: boolean,
): boolean {
  return isUserInitiated && canRequestDevicePermission(permission);
}

type PhotoPreviewPage = {
  hasNextPhotoPage: boolean;
  nextOffset: number;
  photoPreviews: PhotoPreview[];
};

const photoPreviewQuery = (offset: number, limit: number) =>
  new MediaLibrary.Query()
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ ascending: false, key: MediaLibrary.AssetField.CREATION_TIME })
    .limit(limit)
    .offset(offset);

/** Reads only the page the caller shows; every row costs a native metadata fetch. */
export async function loadPhotoPreviewPage(
  offset: number,
  limit: number,
): Promise<PhotoPreviewPage> {
  const assets = await photoPreviewQuery(offset, limit).exeForMetadata();
  const photoPreviews = assets.map((asset) => ({
    fileName: asset.filename ?? 'Image',
    id: asset.id,
    // expo-image reads ph:// on iOS and content:// on Android directly, so
    // showing a preview does not need to export the original into app storage.
    uri: asset.id,
  }));

  return {
    hasNextPhotoPage: assets.length === limit,
    nextOffset: offset + assets.length,
    photoPreviews,
  };
}
