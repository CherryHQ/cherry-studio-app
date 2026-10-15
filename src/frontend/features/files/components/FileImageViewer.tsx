/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
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
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useSaveImageToPhotos, useShareFile } from '@/frontend/appShell/fileExport';
import { ArtifactImagePages, ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { queryKeys } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';
import { imageEditGeometry } from '@/shared/utils/imageEditGeometry';

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
  const { theme } = useUniwind();
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
        icon={<ShareIcon className="size-5 text-foreground" />}
        label={t('fileViewer.share')}
        onPress={() => void share()}
      />
      {editing.canEdit && (isDocument || stillImageUri === file.uri) ? (
        <ImagePreviewToolbar.Action
          emphasis="primary"
          icon={<PencilIcon className="size-5 text-primary" />}
          label={t('common.edit')}
          onPress={() => {
            setIsZoomed(false);
            editing.start();
          }}
        />
      ) : null}
      <ImagePreviewToolbar.Action
        icon={<DownloadIcon className="size-5 text-foreground" />}
        label={t('fileViewer.saveToPhotos')}
        onPress={() => void saveToPhotos()}
      />
    </ImagePreviewToolbar>
  );

  if (editing.isEditing) {
    return (
      <View className="flex-1 bg-background px-safe pt-safe pb-safe">
        <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ImageEditor
          uri={file.uri}
          getGeometry={imageEditGeometry}
          isSaving={editing.isSaving}
          labels={{
            cancel: t('common.cancel'),
            done: t('common.done'),
            title: t('imageEditor.title'),
            loading: t('fileViewer.loading'),
            saving: t('imageEditor.saving'),
            reset: t('imageEditor.reset'),
            rotate: t('imageEditor.rotate'),
            undo: t('imageEditor.undo'),
            redo: t('imageEditor.redo'),
            aspect: t('imageEditor.aspect'),
            aspectRatio: t('imageEditor.aspectRatio'),
            direction: t('imageEditor.direction'),
            perspective: t('imageEditor.perspective'),
            compare: t('imageEditor.compare'),
            zero: t('imageEditor.zero'),
            increase: (label) => t('imageEditor.increase', { label }),
            decrease: (label) => t('imageEditor.decrease', { label }),
            free: t('imageEditor.free'),
            original: t('imageEditor.original'),
            screen: t('imageEditor.screen'),
            screenLandscape: t('imageEditor.screenLandscape'),
            straighten: t('imageEditor.straighten'),
            horizontal: t('imageEditor.horizontal'),
            vertical: t('imageEditor.vertical'),
            flipHorizontal: t('imageEditor.flipHorizontal'),
            flipVertical: t('imageEditor.flipVertical'),
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
        className="flex-1 bg-background px-safe pb-safe"
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      >
        <View className="flex-1">
          {!isDocument ? (
            <ArtifactImageViewer
              accessibilityLabel={file.entry.filename}
              onZoomChange={setIsZoomed}
              onLoad={({ source }) => setStillImageUri(source.isAnimated ? undefined : file.uri)}
              uri={file.uri}
            />
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
        </View>
        {toolbar}
      </View>
    </>
  );
}
