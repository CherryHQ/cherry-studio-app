import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import {
  ActionMenu,
  Button,
  ContentState,
  Image,
  SelectionIndicator,
  useToast,
} from '@cherrystudio/ui/components';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import {
  claimDocumentExportRequest,
  getDocumentExportRequest,
  scheduleDocumentExportFinish,
  type DocumentExportOption,
} from '@/frontend/appShell/documentExport';
import { RouteHeader } from '@/frontend/appShell/header';
import { MarkdownText } from '@/frontend/components/MarkdownText';
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
        <DocumentExportBody
          initialFormat={request.initialFormat}
          option={request.option}
          session={request.session}
        />
      ) : (
        <View className="flex-1 justify-center p-6">
          <ContentState.Error title={t('documentExport.unavailable')} />
        </View>
      )}
    </View>
  );
}

function DocumentExportBody({
  session: checkedSession,
  initialFormat,
  option,
}: {
  session: DocumentExportSession;
  initialFormat: ExportFormat;
  option?: DocumentExportOption;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [selection, setSelection] = useState({
    format: initialFormat,
    isOptionChecked: true,
    revision: 0,
  });
  const { format, isOptionChecked, revision } = selection;
  const session = !isOptionChecked && option ? option.uncheckedSession : checkedSession;
  const [fontStep] = usePreference('ui.font_size_step');
  const [background, foreground, muted, border, link] = useThemeColor([
    'background',
    'foreground',
    'muted-foreground',
    'border',
    'link',
  ]);
  const width = Math.floor(Math.min(600, Math.max(280, windowWidth - 32)));
  const [presentation] = useState(() => ({
    width,
    fontSize: 16 + fontStep * 2,
    colors: { background, foreground, muted, border, link },
  }));
  const { capture, surface } = useDocumentExportHtmlCapture();
  const { state, getArtifact, retry } = useDocumentExportPreview(
    session,
    format,
    presentation,
    capture,
    revision,
  );
  const [isSharing, setIsSharing] = useState(false);
  const sharing = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => sharing.current?.abort(), []);
  const isReady = state.status === 'markdown' || state.status === 'ready';
  const artifact = state.status === 'ready' ? state.artifact : undefined;
  const selectFormat = useCallback((value: ExportFormat) => {
    if (!sharing.current)
      setSelection((current) =>
        current.format === value
          ? current
          : { ...current, format: value, revision: current.revision + 1 },
      );
  }, []);
  const share = async () => {
    if (sharing.current || !isReady) return;
    const controller = new AbortController();
    sharing.current = controller;
    setIsSharing(true);
    try {
      const selected = await getArtifact(controller.signal);
      const file = await session.save(selected, controller.signal);
      controller.signal.throwIfAborted();
      if (!(await Sharing.isAvailableAsync())) {
        controller.signal.throwIfAborted();
        toast.show({ label: t('fileViewer.shareUnavailable'), variant: 'danger' });
        return;
      }
      controller.signal.throwIfAborted();
      await shareFile(file);
    } catch {
      if (!controller.signal.aborted)
        toast.show({ label: t('documentExport.deliveryFailed'), variant: 'danger' });
    } finally {
      sharing.current = undefined;
      if (!controller.signal.aborted) setIsSharing(false);
    }
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between gap-3 px-4 py-2">
        <View className="min-w-0 flex-1">
          {option ? (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isOptionChecked, disabled: isSharing }}
              className="min-h-11 flex-row items-center gap-2 active:opacity-60 disabled:opacity-40"
              disabled={isSharing}
              onPress={() => {
                if (!sharing.current)
                  setSelection((current) => ({
                    ...current,
                    isOptionChecked: !current.isOptionChecked,
                    revision: current.revision + 1,
                  }));
              }}
            >
              <SelectionIndicator selected={isOptionChecked} />
              <Text className="flex-shrink text-foreground text-sm">{option.label}</Text>
            </Pressable>
          ) : null}
        </View>
        <ExportFormatMenu disabled={isSharing} format={format} onSelect={selectFormat} />
      </View>
      {state.status === 'markdown' ? (
        <ScrollView className="flex-1" contentContainerClassName="p-4">
          <MarkdownText markdown={state.text} />
        </ScrollView>
      ) : artifact ? (
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
                  ? { children: t('documentExport.useHtml'), onPress: () => selectFormat('html') }
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
      <View className="gap-3 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
        {artifact && artifact.issues.length > 0 ? (
          <Text className="text-muted-foreground text-sm">
            {t('documentExport.issues', { count: artifact.issues.length })}
          </Text>
        ) : null}
        <Button disabled={!isReady || isSharing} loading={isSharing} onPress={() => void share()}>
          {t('documentExport.share')}
        </Button>
      </View>
    </View>
  );
}

function ExportFormatMenu({
  disabled,
  format,
  onSelect,
}: {
  disabled: boolean;
  format: ExportFormat;
  onSelect(format: ExportFormat): void;
}) {
  const { t } = useTranslation();
  return (
    <ActionMenu
      items={(['markdown', 'html', 'image'] as const).map((value) => ({
        id: value,
        label: t(`documentExport.formats.${value}`),
        checked: format === value,
        disabled,
        onPress: () => onSelect(value),
      }))}
    >
      <Button
        accessibilityLabel={`${t('documentExport.format')}: ${t(`documentExport.formats.${format}`)}`}
        disabled={disabled}
        icon={<ChevronDownIcon size={16} />}
        size="sm"
        variant="ghost"
      >
        {t(`documentExport.formats.${format}`)}
      </Button>
    </ActionMenu>
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
  if (artifact.format !== 'image') return null;
  return (
    <ScrollView className="flex-1" contentContainerClassName="items-center px-4 py-2">
      <Image
        accessibilityLabel={t('documentExport.imagePreview')}
        contentFit="contain"
        onError={() => setFailed(true)}
        source={{ uri: artifact.file.uri }}
        style={{ width, height: (width * artifact.height) / artifact.width }}
      />
    </ScrollView>
  );
}
