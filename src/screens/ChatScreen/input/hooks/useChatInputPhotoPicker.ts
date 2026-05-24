import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  filterChatInputSelectedPhotoIds,
  getChatInputSelectedPhotoOrder,
  getNextChatInputSelectedPhotoIds,
} from '@/screens/ChatScreen/input/utils/chatInputPhotoSelection';

export type ChatInputPhotoAccess = 'all' | 'limited' | 'none';

export type ChatInputPhotoPreview = {
  id: string;
  uri: string;
};

const maxPhotoPreviewCount = 20;

type PhotoLibrarySnapshot = {
  photoAccess: ChatInputPhotoAccess;
  photoPreviews: ChatInputPhotoPreview[];
};

type ChatInputPhotoPickerState = {
  photoAccess: ChatInputPhotoAccess | null;
  photoPreviews: ChatInputPhotoPreview[];
  selectedPhotoCount: number;
  selectedPhotoOrder: ReadonlyMap<string, number>;
  shouldShowPhotosTile: boolean;
};

type ChatInputPhotoPickerActions = {
  clearSelectedPhotos: () => void;
  launchCamera: () => Promise<void>;
  launchImageLibrary: () => Promise<void>;
  presentLimitedPhotoPermissionsPicker: () => Promise<void>;
  togglePhotoSelection: (photoId: string) => void;
};

const photoPreviewQuery = () =>
  new MediaLibrary.Query()
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ ascending: false, key: MediaLibrary.AssetField.CREATION_TIME })
    .limit(maxPhotoPreviewCount);

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

async function loadPhotoPreviews() {
  const assets = await photoPreviewQuery().exe();
  const previews = await Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      uri: await asset.getUri(),
    })),
  );

  return previews;
}

async function readPhotoLibrarySnapshot(): Promise<PhotoLibrarySnapshot> {
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  const photoAccess = readPhotoAccess(permission);

  if (!permission.granted) {
    return {
      photoAccess,
      photoPreviews: [],
    };
  }

  return {
    photoAccess,
    photoPreviews: await loadPhotoPreviews(),
  };
}

export function useChatInputPhotoPicker(isOpen: boolean) {
  const [photoAccess, setPhotoAccess] = useState<ChatInputPhotoAccess | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<ChatInputPhotoPreview[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  const selectedPhotoCount = selectedPhotoIds.length;
  const shouldShowPhotosTile = photoAccess !== 'all';

  const selectedPhotoOrder = useMemo(() => {
    return getChatInputSelectedPhotoOrder(selectedPhotoIds);
  }, [selectedPhotoIds]);

  const applyPhotoLibrarySnapshot = useCallback((snapshot: PhotoLibrarySnapshot) => {
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

  const refreshPhotoPermissionsAndPreviews = useCallback(async () => {
    const snapshot = await readPhotoLibrarySnapshot();
    applyPhotoLibrarySnapshot(snapshot);
  }, [applyPhotoLibrarySnapshot]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    void readPhotoLibrarySnapshot()
      .then((snapshot) => {
        if (isMounted) {
          applyPhotoLibrarySnapshot(snapshot);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPhotoAccess('none');
          setPhotoPreviews([]);
          setSelectedPhotoIds([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [applyPhotoLibrarySnapshot, isOpen]);

  const launchCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    await refreshPhotoPermissionsAndPreviews();
  }, [refreshPhotoPermissionsAndPreviews]);

  const launchImageLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

    if (!permission.granted) {
      setPhotoAccess('none');
      setPhotoPreviews([]);
      setSelectedPhotoIds([]);
      return;
    }

    setPhotoAccess(permission.accessPrivileges ?? 'all');

    await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      orderedSelection: true,
      quality: 1,
      selectionLimit: maxPhotoPreviewCount,
    });

    await refreshPhotoPermissionsAndPreviews();
  }, [refreshPhotoPermissionsAndPreviews]);

  const presentLimitedPhotoPermissionsPicker = useCallback(async () => {
    await MediaLibrary.presentPermissionsPicker(['photo']);
    await refreshPhotoPermissionsAndPreviews();
  }, [refreshPhotoPermissionsAndPreviews]);

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotoIds((current) => getNextChatInputSelectedPhotoIds(current, photoId));
  }, []);

  const clearSelectedPhotos = useCallback(() => {
    setSelectedPhotoIds([]);
  }, []);

  const state: ChatInputPhotoPickerState = useMemo(
    () => ({
      photoAccess,
      photoPreviews,
      selectedPhotoCount,
      selectedPhotoOrder,
      shouldShowPhotosTile,
    }),
    [photoAccess, photoPreviews, selectedPhotoCount, selectedPhotoOrder, shouldShowPhotosTile],
  );

  const actions: ChatInputPhotoPickerActions = useMemo(
    () => ({
      clearSelectedPhotos,
      launchCamera,
      launchImageLibrary,
      presentLimitedPhotoPermissionsPicker,
      togglePhotoSelection,
    }),
    [
      clearSelectedPhotos,
      launchCamera,
      launchImageLibrary,
      presentLimitedPhotoPermissionsPicker,
      togglePhotoSelection,
    ],
  );

  return {
    actions,
    state,
  };
}
