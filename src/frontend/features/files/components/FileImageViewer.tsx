import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import {
  ContentState,
  ImageEditor,
  ImagePreviewToolbar,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSaveImageToPhotos, useShareFile } from '@/frontend/appShell/fileExport';
import { ArtifactImagePages, ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { queryKeys } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useFileImageEdit } from '../hooks/useFileImageEdit';
import { readPngDimensions } from '../utils/readPngDimensions';
import { FileViewerHeader } from './FileViewerHeader';

export function FileImageViewer({
  file: initialFile,
  imageEditRequestId,
}: {
  file: ResolvedFile;
  imageEditRequestId?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const editing = useFileImageEdit(initialFile, imageEditRequestId);
  const { file } = editing;
  const { isSharing, share } = useShareFile(file);
  const saveToPhotos = useSaveImageToPhotos({ uri: file.uri, provenance: file.entry.provenance });
  const [isZoomed, setIsZoomed] = useState(false);
  const [stillImageUri, setStillImageUri] = useState<string>();
  const [width, setWidth] = useState(0);
  const isDocument =
    file.entry.provenance === 'document-export' && file.entry.mediaType === 'image/png';
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dimensionsQuery = useQuery({
    enabled: isDocument,
    queryKey: queryKeys.files.imageDimensions(file.entry, file.uri),
    queryFn: () => {
      const dimensions = readPngDimensions(file.uri);
      if (!dimensions) throw new Error('Invalid PNG');
      return dimensions;
    },
    networkMode: 'always',
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const dimensions = dimensionsQuery.data;

  const toolbar = (
    <ImagePreviewToolbar>
      <ImagePreviewToolbar.Action
        disabled={isSharing}
        icon={<ShareIcon className="size-6 text-constant-white" />}
        label={t('fileViewer.share')}
        onPress={() => void share()}
      />
      {editing.canEdit && (isDocument || stillImageUri === file.uri) ? (
        <ImagePreviewToolbar.Action
          icon={<PencilIcon className="size-6 text-constant-white" />}
          label={t('common.edit')}
          onPress={() => {
            setIsZoomed(false);
            editing.start();
          }}
        />
      ) : null}
      <ImagePreviewToolbar.Action
        icon={<DownloadIcon className="size-6 text-constant-white" />}
        label={t('fileViewer.saveToPhotos')}
        onPress={() => void saveToPhotos()}
      />
    </ImagePreviewToolbar>
  );

  if (editing.isEditing) {
    return (
      <View className="flex-1 px-safe pt-safe pb-safe">
        <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
        <ImageEditor
          uri={file.uri}
          isSaving={editing.isSaving}
          labels={{
            cancel: t('common.cancel'),
            done: t('common.done'),
            title: t('imageEditor.title'),
            loading: t('fileViewer.loading'),
            saving: t('imageEditor.saving'),
            hint: t('imageEditor.cropHint'),
            reset: t('imageEditor.reset'),
            rotate: t('imageEditor.rotate'),
            cropLeft: t('imageEditor.cropLeft'),
            cropRight: t('imageEditor.cropRight'),
            cropTop: t('imageEditor.cropTop'),
            cropBottom: t('imageEditor.cropBottom'),
          }}
          onCancel={editing.cancel}
          onSubmit={(edit) => void editing.save(edit)}
          onError={() => {
            editing.cancel();
            toast.show({ label: t('fileViewer.previewFailed'), variant: 'danger' });
          }}
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isZoomed, headerShown: true }} />
      <FileViewerHeader file={file} />
      <View
        className="flex-1 px-safe pb-safe"
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      >
        {!isDocument ? (
          <ArtifactImageViewer
            accessibilityLabel={file.entry.filename}
            onZoomChange={setIsZoomed}
            onLoad={({ source }) => setStillImageUri(source.isAnimated ? undefined : file.uri)}
            uri={file.uri}
          >
            {toolbar}
          </ArtifactImageViewer>
        ) : failed || dimensionsQuery.isError ? (
          <View className="flex-1 justify-center bg-background p-6">
            <ContentState.Error
              title={t('fileViewer.previewFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => {
                  setFailed(false);
                  setIsZoomed(false);
                  setAttempt((value) => value + 1);
                  void dimensionsQuery.refetch();
                },
              }}
            />
          </View>
        ) : dimensions && width > 0 ? (
          <ArtifactImagePages
            key={attempt}
            images={[{ ...dimensions, uri: file.uri, label: file.entry.filename }]}
            onError={() => {
              setFailed(true);
              setIsZoomed(false);
            }}
            onZoomChange={setIsZoomed}
            width={width}
          />
        ) : (
          <View className="flex-1 justify-center bg-background p-6">
            <ContentState.Loading title={t('fileViewer.loading')} />
          </View>
        )}
        {isDocument ? toolbar : null}
      </View>
    </>
  );
}
