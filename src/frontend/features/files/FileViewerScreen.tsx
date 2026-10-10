/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import { ContentState } from '@cherrystudio/ui/components';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { fileEntryPreviewKind, useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { type FileEntryId, FileEntryIdSchema } from '@/shared/data/types/file';

import { FileDocumentViewer } from './components/FileDocumentViewer';
import { FileImageViewer } from './components/FileImageViewer';
import { FileTextViewer } from './components/FileTextViewer';

export function FileViewerScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    imageEditRequestId?: string | string[];
  }>();
  const imageEditRequestId = getSingleRouteParam(params.imageEditRequestId);
  const entryId = FileEntryIdSchema.safeParse(getSingleRouteParam(params.fileEntryId));

  if (!entryId.success) {
    return (
      <View className="flex-1 bg-background">
        <RouteHeader title={t('filePreview.unavailable')} />
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Error title={t('filePreview.unavailable')} />
        </View>
      </View>
    );
  }
  return (
    <FileViewerRoute
      entryId={entryId.data}
      imageEditRequestId={imageEditRequestId}
      key={`${entryId.data}:${imageEditRequestId ?? ''}`}
    />
  );
}

function FileViewerRoute({
  entryId,
  imageEditRequestId,
}: {
  entryId: FileEntryId;
  imageEditRequestId?: string;
}) {
  const { t } = useTranslation();
  const query = useResolvedFile(entryId);
  const [background, foreground, black, white] = useThemeColor([
    'background',
    'foreground',
    'constant-black',
    'constant-white',
  ]);
  const file = query.data;
  const kind = file ? fileEntryPreviewKind(file.entry) : 'document';
  const isImage = kind === 'image';

  return (
    <View className={isImage ? 'flex-1 bg-constant-black' : 'flex-1 bg-background'}>
      <Stack.Screen
        options={{
          contentStyle: { backgroundColor: isImage ? black : background },
          headerStyle: { backgroundColor: isImage ? black : background },
          headerTintColor: isImage ? white : foreground,
          headerTransparent: false,
        }}
      />
      <StatusBar style={isImage ? 'light' : 'auto'} />
      {!file ? (
        <>
          <RouteHeader
            title={query.isLoading ? t('fileViewer.loading') : t('filePreview.unavailable')}
          />
          <View className="flex-1 items-center justify-center p-6">
            {query.isLoading ? (
              <ContentState.Loading title={t('fileViewer.loading')} />
            ) : (
              <ContentState.Error
                primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
                title={t('filePreview.unavailable')}
              />
            )}
          </View>
        </>
      ) : kind === 'image' ? (
        <FileImageViewer
          file={file}
          imageEditRequestId={imageEditRequestId}
          key={`${file.entry.updatedAt}:${file.uri}`}
        />
      ) : kind === 'document' ? (
        <FileDocumentViewer file={file} key={`${file.entry.updatedAt}:${file.uri}`} />
      ) : (
        <FileTextViewer file={file} key={`${file.entry.updatedAt}:${file.uri}`} kind={kind} />
      )}
    </View>
  );
}
