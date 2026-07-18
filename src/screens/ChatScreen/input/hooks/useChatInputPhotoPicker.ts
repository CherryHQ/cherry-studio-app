import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import { createPhotoAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  filterChatInputSelectedPhotoIds,
  getChatInputSelectedPhotoOrder,
  getNextChatInputSelectedPhotoIds,
} from '@/screens/ChatScreen/input/utils/chatInputPhotoSelection';

export type ChatInputPhotoAccess = 'all' | 'limited' | 'none';

export type ChatInputPhotoPreview = {
  fileName: string;
  id: string;
  uri: string;
};

export const CHAT_INPUT_PHOTO_SELECTION_LIMIT = 9;

const photoPreviewPageSize = 60;
const photoPermissionsPickerRefreshDelay = 500;

type PhotoPreviewPage = {
  hasNextPhotoPage: boolean;
  nextOffset: number;
  photoPreviews: ChatInputPhotoPreview[];
};

type PhotoLibrarySnapshot = {
  canAskPhotoPermissionAgain: boolean;
  hasNextPhotoPage: boolean;
  nextOffset: number;
  photoAccess: ChatInputPhotoAccess;
  photoPreviews: ChatInputPhotoPreview[];
};

export type ChatInputPhotoPickerState = {
  canAskPhotoPermissionAgain: boolean;
  hasNextPhotoPage: boolean;
  isPhotoPageLoading: boolean;
  photoAccess: ChatInputPhotoAccess | null;
  photoPreviews: ChatInputPhotoPreview[];
  selectedPhotoCount: number;
  selectedPhotoOrder: ReadonlyMap<string, number>;
  shouldShowPhotosTile: boolean;
};

export type ChatInputPhotoPickerActions = {
  addSelectedPhotoPreviews: () => Promise<boolean>;
  clearSelectedPhotos: () => void;
  loadMorePhotoPreviews: () => Promise<void>;
  presentLimitedPhotoPermissionsPicker: () => Promise<void>;
  requestPhotoLibraryPermission: () => Promise<void>;
  togglePhotoSelection: (photoId: string) => void;
};

const photoPreviewQuery = (offset: number) =>
  new MediaLibrary.Query()
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ ascending: false, key: MediaLibrary.AssetField.CREATION_TIME })
    .limit(photoPreviewPageSize)
    .offset(offset);

function readPhotoAccess(permission: MediaLibrary.PermissionResponse): ChatInputPhotoAccess {
  const accessPrivileges = (
    permission as MediaLibrary.PermissionResponse & {
      accessPrivileges?: ChatInputPhotoAccess;
    }
  ).accessPrivileges;

  if (!permission.granted) {
    return 'none';
  }

  return accessPrivileges ?? 'all';
}

export async function loadPhotoPreviewPage(offset: number): Promise<PhotoPreviewPage> {
  const assets = await photoPreviewQuery(offset).exeForMetadata();
  const photoPreviews = assets.map((asset) => ({
    fileName: asset.filename ?? 'Image',
    id: asset.id,
    // expo-image reads ph:// on iOS and content:// on Android directly, so
    // opening the grid does not need to export every original into app storage.
    uri: asset.id,
  }));

  return {
    hasNextPhotoPage: assets.length === photoPreviewPageSize,
    nextOffset: offset + assets.length,
    photoPreviews,
  };
}

async function readPhotoLibrarySnapshot(
  knownPermission?: MediaLibrary.PermissionResponse,
): Promise<PhotoLibrarySnapshot> {
  const permission = knownPermission ?? (await MediaLibrary.getPermissionsAsync(false, ['photo']));
  const photoAccess = readPhotoAccess(permission);

  if (!permission.granted) {
    return {
      canAskPhotoPermissionAgain: permission.canAskAgain,
      hasNextPhotoPage: false,
      nextOffset: 0,
      photoAccess,
      photoPreviews: [],
    };
  }

  const firstPage = await loadPhotoPreviewPage(0);

  return {
    ...firstPage,
    canAskPhotoPermissionAgain: permission.canAskAgain,
    photoAccess,
  };
}

export function useChatInputPhotoPicker(
  isOpen: boolean,
  onAttachmentsAdd: (attachments: ChatInputAttachmentDraft[]) => void,
) {
  const isOpenRef = useRef(isOpen);
  const photoPermissionsPickerRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const photoLoadRevisionRef = useRef(0);
  const loadingRevisionRef = useRef<number | null>(null);
  const nextPhotoPageOffsetRef = useRef(0);
  const [canAskPhotoPermissionAgain, setCanAskPhotoPermissionAgain] = useState(true);
  const [hasNextPhotoPage, setHasNextPhotoPage] = useState(false);
  const [isPhotoPageLoading, setIsPhotoPageLoading] = useState(false);
  const [photoAccess, setPhotoAccess] = useState<ChatInputPhotoAccess | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<ChatInputPhotoPreview[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  const selectedPhotoCount = selectedPhotoIds.length;
  const shouldShowPhotosTile = photoAccess !== 'all';

  const selectedPhotoOrder = useMemo(() => {
    return getChatInputSelectedPhotoOrder(selectedPhotoIds);
  }, [selectedPhotoIds]);

  const applyPhotoLibrarySnapshot = useCallback((snapshot: PhotoLibrarySnapshot) => {
    nextPhotoPageOffsetRef.current = snapshot.nextOffset;
    setCanAskPhotoPermissionAgain(snapshot.canAskPhotoPermissionAgain);
    setHasNextPhotoPage(snapshot.hasNextPhotoPage);
    setPhotoAccess(snapshot.photoAccess);
    setPhotoPreviews(snapshot.photoPreviews);

    if (snapshot.photoAccess === 'none') {
      setSelectedPhotoIds([]);
      return;
    }

    setSelectedPhotoIds((current) =>
      filterChatInputSelectedPhotoIds(current, snapshot.photoAccess, snapshot.photoPreviews),
    );
  }, []);

  const refreshPhotoPermissionsAndPreviews = useCallback(
    async (knownPermission?: MediaLibrary.PermissionResponse) => {
      const revision = photoLoadRevisionRef.current + 1;
      photoLoadRevisionRef.current = revision;
      loadingRevisionRef.current = revision;
      setIsPhotoPageLoading(true);

      try {
        const snapshot = await readPhotoLibrarySnapshot(knownPermission);

        if (photoLoadRevisionRef.current === revision) {
          applyPhotoLibrarySnapshot(snapshot);
        }
      } catch {
        if (photoLoadRevisionRef.current === revision) {
          nextPhotoPageOffsetRef.current = 0;
          setCanAskPhotoPermissionAgain(false);
          setHasNextPhotoPage(false);
          setPhotoAccess('none');
          setPhotoPreviews([]);
          setSelectedPhotoIds([]);
        }
      }

      if (loadingRevisionRef.current === revision) {
        loadingRevisionRef.current = null;
        setIsPhotoPageLoading(false);
      }
    },
    [applyPhotoLibrarySnapshot],
  );

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      void refreshPhotoPermissionsAndPreviews();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isOpen, refreshPhotoPermissionsAndPreviews]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const subscription = MediaLibrary.addListener(() => {
      void refreshPhotoPermissionsAndPreviews();
    });

    return () => {
      subscription.remove();
    };
  }, [isOpen, refreshPhotoPermissionsAndPreviews]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleAppStateChange = (status: AppStateStatus) => {
      if (status === 'active' && isOpenRef.current) {
        void refreshPhotoPermissionsAndPreviews();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isOpen, refreshPhotoPermissionsAndPreviews]);

  useEffect(() => {
    return () => {
      if (photoPermissionsPickerRefreshTimeoutRef.current) {
        clearTimeout(photoPermissionsPickerRefreshTimeoutRef.current);
      }
    };
  }, []);

  const requestPhotoLibraryPermission = useCallback(async () => {
    const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    await refreshPhotoPermissionsAndPreviews(permission);
  }, [refreshPhotoPermissionsAndPreviews]);

  const presentLimitedPhotoPermissionsPicker = useCallback(async () => {
    await MediaLibrary.presentPermissionsPicker(['photo']);
    if (photoPermissionsPickerRefreshTimeoutRef.current) {
      clearTimeout(photoPermissionsPickerRefreshTimeoutRef.current);
    }
    photoPermissionsPickerRefreshTimeoutRef.current = setTimeout(() => {
      if (isOpenRef.current) {
        void refreshPhotoPermissionsAndPreviews();
      }
      photoPermissionsPickerRefreshTimeoutRef.current = null;
    }, photoPermissionsPickerRefreshDelay);
  }, [refreshPhotoPermissionsAndPreviews]);

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotoIds((current) =>
      getNextChatInputSelectedPhotoIds(current, photoId, CHAT_INPUT_PHOTO_SELECTION_LIMIT),
    );
  }, []);

  const clearSelectedPhotos = useCallback(() => {
    setSelectedPhotoIds([]);
  }, []);

  const addSelectedPhotoPreviews = useCallback(async () => {
    if (selectedPhotoIds.length === 0) {
      return false;
    }

    const photoPreviewById = new Map(photoPreviews.map((photo) => [photo.id, photo]));
    const selectedPhotoPreviews = selectedPhotoIds
      .map((photoId) => photoPreviewById.get(photoId))
      .filter((photo): photo is ChatInputPhotoPreview => photo !== undefined);

    if (selectedPhotoPreviews.length === 0) {
      clearSelectedPhotos();
      return false;
    }

    const attachments = await Promise.all(
      selectedPhotoPreviews.map(async (photo) => {
        const uri = await new MediaLibrary.Asset(photo.id).getUri();
        return createPhotoAttachmentDraft({
          ...photo,
          uri,
        });
      }),
    );

    onAttachmentsAdd(attachments);
    clearSelectedPhotos();
    return true;
  }, [clearSelectedPhotos, onAttachmentsAdd, photoPreviews, selectedPhotoIds]);

  const loadMorePhotoPreviews = useCallback(async () => {
    if (
      loadingRevisionRef.current !== null ||
      !hasNextPhotoPage ||
      photoAccess === null ||
      photoAccess === 'none'
    ) {
      return;
    }

    const revision = photoLoadRevisionRef.current;
    loadingRevisionRef.current = revision;
    setIsPhotoPageLoading(true);

    const page = await loadPhotoPreviewPage(nextPhotoPageOffsetRef.current).finally(() => {
      if (loadingRevisionRef.current === revision) {
        loadingRevisionRef.current = null;
        setIsPhotoPageLoading(false);
      }
    });

    if (photoLoadRevisionRef.current !== revision) {
      return;
    }

    nextPhotoPageOffsetRef.current = page.nextOffset;
    setHasNextPhotoPage(page.hasNextPhotoPage);
    setPhotoPreviews((current) => {
      const existingPhotoIds = new Set(current.map((photo) => photo.id));
      return [...current, ...page.photoPreviews.filter((photo) => !existingPhotoIds.has(photo.id))];
    });
  }, [hasNextPhotoPage, photoAccess]);

  const state: ChatInputPhotoPickerState = useMemo(
    () => ({
      canAskPhotoPermissionAgain,
      hasNextPhotoPage,
      isPhotoPageLoading,
      photoAccess,
      photoPreviews,
      selectedPhotoCount,
      selectedPhotoOrder,
      shouldShowPhotosTile,
    }),
    [
      canAskPhotoPermissionAgain,
      hasNextPhotoPage,
      isPhotoPageLoading,
      photoAccess,
      photoPreviews,
      selectedPhotoCount,
      selectedPhotoOrder,
      shouldShowPhotosTile,
    ],
  );

  const actions: ChatInputPhotoPickerActions = useMemo(
    () => ({
      addSelectedPhotoPreviews,
      clearSelectedPhotos,
      loadMorePhotoPreviews,
      presentLimitedPhotoPermissionsPicker,
      requestPhotoLibraryPermission,
      togglePhotoSelection,
    }),
    [
      addSelectedPhotoPreviews,
      clearSelectedPhotos,
      loadMorePhotoPreviews,
      presentLimitedPhotoPermissionsPicker,
      requestPhotoLibraryPermission,
      togglePhotoSelection,
    ],
  );

  return {
    actions,
    state,
  };
}
