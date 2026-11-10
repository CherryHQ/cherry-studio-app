/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import { ContentState } from '@cherrystudio/ui/components';
import { Stack, useGlobalSearchParams, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  parseChatPreviewSource,
  parseChatRoute,
  type ChatRouteParamsInput,
  type ChatTarget,
} from '@/frontend/appShell/navigation/chat';
import type { FilePaneFile } from '@/frontend/appShell/pane/state';
import { fileEntryPreviewKind, useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { type FileEntryId, FileEntryIdSchema } from '@/shared/data/types/file';

import { FileDocumentViewer } from './components/FileDocumentViewer';
import { FileImageViewer } from './components/FileImageViewer';
import { FileTextViewer } from './components/FileTextViewer';

export function FileViewerScreen() {
  const { t } = useTranslation();
  const [background, foreground] = useThemeColor(['background', 'foreground']);
  const { theme } = useUniwind();
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    imageEditRequestId?: string | string[];
    sourceChat?: string | string[];
  }>();
  const sourceChat = parseChatPreviewSource(getSingleRouteParam(params.sourceChat));
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
    <>
      <Stack.Screen
        options={{
          contentStyle: { backgroundColor: background },
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
          headerTransparent: false,
        }}
      />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <FileViewer
        entryId={entryId.data}
        imageEditRequestId={imageEditRequestId}
        sourceChat={sourceChat}
        key={`${entryId.data}:${imageEditRequestId ?? ''}`}
      />
    </>
  );
}

/** The same viewer beside the chat; Office references go to the conversation it sits next to. */
export function FileViewerPane({ entryId, imageEditRequestId }: FilePaneFile) {
  const chatRoute = parseChatRoute(useGlobalSearchParams<ChatRouteParamsInput>());

  return (
    <FileViewer
      entryId={entryId}
      imageEditRequestId={imageEditRequestId}
      sourceChat={chatRoute.status === 'ready' ? chatRoute.target : undefined}
      key={`${entryId}:${imageEditRequestId ?? ''}`}
    />
  );
}

function FileViewer({
  entryId,
  imageEditRequestId,
  sourceChat,
}: {
  entryId: FileEntryId;
  imageEditRequestId?: string;
  sourceChat?: ChatTarget;
}) {
  const { t } = useTranslation();
  const query = useResolvedFile(entryId);
  const file = query.data;
  const kind = file ? fileEntryPreviewKind(file.entry) : 'document';

  return (
    <View className="flex-1 bg-background">
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
          sourceChat={sourceChat}
        />
      ) : kind === 'document' || kind === 'audio' ? (
        <FileDocumentViewer file={file} sourceChat={sourceChat} key={file.entry.id} />
      ) : (
        <FileTextViewer
          file={file}
          key={`${file.entry.updatedAt}:${file.uri}`}
          kind={kind}
          sourceChat={sourceChat}
        />
      )}
    </View>
  );
}
