import { Button, ContentState, Image, Tabs, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import {
  claimDocumentExportRequest,
  getDocumentExportRequest,
  scheduleDocumentExportFinish,
} from '@/frontend/appShell/documentExport';
import { RouteHeader } from '@/frontend/appShell/header';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { shareFile } from '@/frontend/utils/shareFile';
import type {
  DocumentExportArtifact,
  DocumentExportSession,
  ExportFormat,
} from '@/shared/contracts/documentExport';

import { useDocumentExportHtmlCapture } from './components/DocumentExportHtmlSurface';
import { useDocumentExportPreview } from './hooks/useDocumentExportPreview';

export function DocumentExportScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const id = getSingleRouteParam(params.requestId);
  return <DocumentExportRoute key={id} requestId={id} />;
}

function DocumentExportRoute({ requestId }: { requestId?: string }) {
  const { t } = useTranslation();
  const [request] = useState(() => getDocumentExportRequest(requestId));
  useEffect(() => {
    if (!request) return;
    claimDocumentExportRequest(request.id);
    return () => scheduleDocumentExportFinish(request.id);
  }, [request]);
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerTransparent: false }} />
      <RouteHeader title={t('documentExport.title')} />
      {request ? (
        <DocumentExportBody initialFormat={request.initialFormat} session={request.session} />
      ) : (
        <View className="flex-1 justify-center p-6">
          <ContentState.Error title={t('documentExport.unavailable')} />
        </View>
      )}
    </View>
  );
}

function DocumentExportBody({
  session,
  initialFormat,
}: {
  session: DocumentExportSession;
  initialFormat: ExportFormat;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [format, setFormat] = useState(initialFormat);
  const [fontStep] = usePreference('ui.font_size_step');
  const [background, foreground, muted, border, link] = useThemeColor([
    'background',
    'foreground',
    'muted-foreground',
    'border',
    'link',
  ]);
  const width = Math.floor(Math.min(600, Math.max(280, windowWidth - 32)));
  // Freeze presentation for this export so a system/theme transition cannot replace an artifact during delivery.
  const [presentation] = useState(() => ({
    width,
    fontSize: 16 + fontStep * 2,
    colors: { background, foreground, muted, border, link },
  }));
  const { capture, surface } = useDocumentExportHtmlCapture();
  const { state, retry } = useDocumentExportPreview(session, format, presentation, capture);
  const [isDelivering, setIsDelivering] = useState(false);
  // A render's result must match the selected tab even before its effect runs.
  const artifact =
    state.status === 'ready' && state.artifact.format === format ? state.artifact : undefined;

  return (
    <View className="flex-1">
      <View className="gap-3 px-4 pt-2 pb-3">
        <Tabs
          accessibilityLabel={t('documentExport.format')}
          items={(['image', 'html', 'markdown'] as const).map((value) => ({
            label: t(`documentExport.formats.${value}`),
            value,
            disabled: isDelivering,
          }))}
          onValueChange={(value) => {
            if (!isDelivering) setFormat(value);
          }}
          value={format}
        />
        <Text className="text-muted-foreground text-sm">{t('documentExport.retention')}</Text>
      </View>
      {artifact ? (
        <ArtifactPreview key={artifact.id} artifact={artifact} width={width} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="items-center gap-4 px-4 py-6"
          removeClippedSubviews={false}
        >
          {state.status === 'error' ? (
            <ContentState.Error
              description={t(`documentExport.errors.${state.code}`)}
              primaryAction={{ children: t('common.retry'), onPress: retry }}
              secondaryAction={
                state.code === 'size-limit' && format === 'image'
                  ? { children: t('documentExport.useHtml'), onPress: () => setFormat('html') }
                  : undefined
              }
              title={t('documentExport.failed')}
            />
          ) : (
            <ContentState.Loading
              title={t(
                `documentExport.progress.${state.status === 'loading' ? state.progress : 'rendering'}`,
              )}
            />
          )}
          {surface}
        </ScrollView>
      )}
      {artifact ? (
        <View className="gap-3 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
          {artifact.issues.length > 0 ? (
            <Text className="text-muted-foreground text-sm">
              {t('documentExport.issues', { count: artifact.issues.length })}
            </Text>
          ) : null}
          <ExportActions
            key={artifact.id}
            artifact={artifact}
            onBusyChange={setIsDelivering}
            session={session}
          />
        </View>
      ) : null}
    </View>
  );
}

function ArtifactPreview({ artifact, width }: { artifact: DocumentExportArtifact; width: number }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed) return <ContentState.Error title={t('documentExport.previewFailed')} />;
  if (artifact.format === 'html')
    return (
      <WebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        incognito
        javaScriptEnabled={false}
        onError={() => setFailed(true)}
        onContentProcessDidTerminate={() => setFailed(true)}
        onRenderProcessGone={() => setFailed(true)}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        originWhitelist={['*']}
        sharedCookiesEnabled={false}
        source={{ html: artifact.html }}
        thirdPartyCookiesEnabled={false}
      />
    );
  return (
    <ScrollView className="flex-1" contentContainerClassName="items-center px-4 py-2">
      {artifact.format === 'markdown' ? (
        <Text className="w-full font-mono text-foreground text-sm" selectable>
          {artifact.text}
        </Text>
      ) : (
        <Image
          accessibilityLabel={t('documentExport.imagePreview')}
          contentFit="contain"
          onError={() => setFailed(true)}
          source={{ uri: artifact.file.uri }}
          style={{ width, height: (width * artifact.height) / artifact.width }}
        />
      )}
    </ScrollView>
  );
}

function ExportActions({
  artifact,
  session,
  onBusyChange,
}: {
  artifact: DocumentExportArtifact;
  session: DocumentExportSession;
  onBusyChange(busy: boolean): void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const busy = useRef(false);
  const mounted = useRef(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const deliver = async (action: 'copy' | 'save' | 'share') => {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    onBusyChange(true);
    try {
      if (action === 'copy' && artifact.format === 'markdown') {
        await Clipboard.setStringAsync(artifact.text);
        if (mounted.current)
          toast.show({ label: t('chat.messageActions.copied'), variant: 'success' });
      } else {
        if (action === 'share' && !(await Sharing.isAvailableAsync())) {
          if (mounted.current)
            toast.show({ label: t('fileViewer.shareUnavailable'), variant: 'danger' });
          return;
        }
        const file = await session.save(artifact);
        if (!mounted.current) return;
        setIsSaved(true);
        if (action === 'share') await shareFile(file);
        else toast.show({ label: t('documentExport.saved'), variant: 'success' });
      }
    } catch {
      if (mounted.current)
        toast.show({ label: t('documentExport.deliveryFailed'), variant: 'danger' });
    } finally {
      busy.current = false;
      onBusyChange(false);
      if (mounted.current) {
        setIsBusy(false);
      }
    }
  };
  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            disabled={isBusy || isSaved}
            onPress={() => void deliver('save')}
            variant="secondary"
          >
            {t(isSaved ? 'documentExport.savedLabel' : 'documentExport.save')}
          </Button>
        </View>
        <View className="flex-1">
          <Button disabled={isBusy} loading={isBusy} onPress={() => void deliver('share')}>
            {t('documentExport.share')}
          </Button>
        </View>
      </View>
      {artifact.format === 'markdown' ? (
        <Button disabled={isBusy} onPress={() => void deliver('copy')} variant="ghost">
          {t('documentExport.copyMarkdown')}
        </Button>
      ) : null}
    </View>
  );
}
