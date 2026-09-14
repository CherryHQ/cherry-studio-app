import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  ActionMenu,
  Button,
  ContentState,
  Image,
  Switch,
  useToast,
} from '@cherrystudio/ui/components';
import { resolveTypographyScale } from '@cherrystudio/ui/utils';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import {
  claimDocumentExportRequest,
  getDocumentExportRequest,
  scheduleDocumentExportFinish,
  type DocumentExportOption,
} from '@/frontend/appShell/documentExport';
import { shareFiles } from '@/frontend/components/FileEntryPreview';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type {
  DocumentExportArtifact,
  DocumentExportSession,
  ExportDocument,
  ExportFormat,
  ExportImage,
  ExportPresentation,
} from '@/shared/contracts/documentExport';

import { useDocumentExportHtmlCapture } from './components/DocumentExportHtmlSurface';
import { DocumentExportTextPreview } from './components/DocumentExportTextPreview';
import { useDocumentExportPreview } from './hooks/useDocumentExportPreview';
import { IMAGE_FRAME_BRAND } from './utils/imageFrameBrand';

export function DocumentExportScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const id = getSingleRouteParam(params.requestId);
  return <DocumentExportRoute key={id} requestId={id} />;
}

function DocumentExportRoute({ requestId }: { requestId?: string }) {
  const { t } = useTranslation();
  const { top, left, right } = useSafeAreaInsets();
  const [request] = useState(() => getDocumentExportRequest(requestId));
  useEffect(() => {
    if (!request) return;
    claimDocumentExportRequest(request.id);
    return () => scheduleDocumentExportFinish(request.id);
  }, [request]);
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: top, paddingLeft: left, paddingRight: right }}
    >
      <View className="flex-row items-center gap-3 px-6 py-3">
        <Button
          accessibilityLabel={t('common.close')}
          icon={<XIcon />}
          onPress={closeExport}
          shape="pill"
          variant="secondary"
        />
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-center text-foreground text-sm"
        >
          {t('documentExport.title')}
        </Text>
        <View className="size-11" />
      </View>
      {request ? (
        <DocumentExportBody
          initialFormat={request.initialFormat}
          option={request.option}
          returnTo={request.returnTo}
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
  returnTo,
}: {
  session: DocumentExportSession;
  initialFormat: ExportFormat;
  option?: DocumentExportOption;
  returnTo?: Href;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom, left, right } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [selection, setSelection] = useState({
    format: initialFormat,
    isOptionChecked: false,
    revision: 0,
  });
  const { format, isOptionChecked, revision } = selection;
  const session = !isOptionChecked && option ? option.uncheckedSession : checkedSession;
  const [fontStep] = usePreference('ui.font_size_step');
  const [
    background,
    foreground,
    muted,
    tertiary,
    border,
    subtleBorder,
    link,
    bubble,
    secondary,
    codeBlock,
    inlineCode,
    inlineCodeForeground,
  ] = useThemeColor([
    'background',
    'foreground',
    'muted-foreground',
    'foreground-tertiary',
    'border',
    'border-subtle',
    'link',
    'chat-user',
    'secondary',
    'code-block',
    'inline-code',
    'inline-code-foreground',
  ]);
  const [layout] = useState(() => {
    const { base, sm, lg, xl } = resolveTypographyScale(fontStep);
    return {
      width: Math.floor(Math.min(600, Math.max(280, windowWidth))),
      typography: { base, sm, lg, xl },
    };
  });
  const presentation = useMemo(
    () => ({
      ...layout,
      colors: {
        background,
        foreground,
        muted,
        tertiary,
        border,
        subtleBorder,
        link,
        bubble,
        secondary,
        codeBlock,
        inlineCode,
        inlineCodeForeground,
      },
    }),
    [
      layout,
      background,
      foreground,
      muted,
      tertiary,
      border,
      subtleBorder,
      link,
      bubble,
      secondary,
      codeBlock,
      inlineCode,
      inlineCodeForeground,
    ],
  );
  const [timestamp] = useState(() => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  const imagePresentations = useMemo(() => {
    const frameDocument = (document: ExportDocument) => {
      const isConversation = document.sections.some((section) => section.presentation);
      return {
        ...presentation,
        imageFrame: {
          ...IMAGE_FRAME_BRAND,
          background: secondary,
          foreground,
          label: t(isConversation ? 'documentExport.conversation' : 'documentExport.document'),
          timestamp,
        },
      };
    };
    return {
      checked: frameDocument(checkedSession.document),
      unchecked: option ? frameDocument(option.uncheckedSession.document) : undefined,
    };
  }, [checkedSession.document, foreground, option, presentation, secondary, t, timestamp]);
  const imagePresentation =
    !isOptionChecked && imagePresentations.unchecked
      ? imagePresentations.unchecked
      : imagePresentations.checked;
  // Theme changes regenerate previews, but cannot replace a file while the share sheet uses it.
  const [deliveryPresentation, setDeliveryPresentation] = useState<ExportPresentation>();
  const previewPresentation =
    deliveryPresentation ?? (format === 'image' ? imagePresentation : presentation);
  const { capture, surface } = useDocumentExportHtmlCapture();
  const { state, getArtifact, retry } = useDocumentExportPreview(
    session,
    format,
    previewPresentation,
    capture,
    revision,
  );
  const [isSharing, setIsSharing] = useState(false);
  const sharing = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => sharing.current?.abort(), []);
  const isReady = state.status === 'markdown' || state.status === 'ready';
  const artifact = state.status === 'ready' ? state.artifact : undefined;
  const activeFormat = state.status === 'markdown' ? 'markdown' : (artifact?.format ?? format);
  const imageCount = artifact?.format === 'image' ? artifact.images.length : 0;
  const selectFormat = useCallback(
    (value: ExportFormat) => {
      if (!sharing.current)
        setSelection((current) =>
          activeFormat === value
            ? current
            : { ...current, format: value, revision: current.revision + 1 },
        );
    },
    [activeFormat],
  );
  const previewFallback = useCallback(() => {
    if (!sharing.current)
      setSelection((current) =>
        current.revision !== revision
          ? current
          : {
              ...current,
              format: activeFormat === 'image' ? 'html' : 'markdown',
              revision: current.revision + 1,
            },
      );
  }, [activeFormat, revision]);
  const share = async () => {
    if (sharing.current || !isReady) return;
    const controller = new AbortController();
    sharing.current = controller;
    setDeliveryPresentation(previewPresentation);
    setIsSharing(true);
    let sheetClosed = false;
    try {
      const selected = await getArtifact(controller.signal);
      const files = await session.save(selected, controller.signal);
      controller.signal.throwIfAborted();
      if (!(await Sharing.isAvailableAsync())) {
        controller.signal.throwIfAborted();
        toast.show({ label: t('fileViewer.shareUnavailable'), variant: 'danger' });
        return;
      }
      controller.signal.throwIfAborted();
      await shareFiles(files, controller.signal);
      sheetClosed = true;
    } catch {
      if (!controller.signal.aborted)
        toast.show({ label: t('documentExport.deliveryFailed'), variant: 'danger' });
    } finally {
      sharing.current = undefined;
      if (!controller.signal.aborted) {
        setIsSharing(false);
        setDeliveryPresentation(undefined);
      }
    }
    // Both platforms resolve the sheet on dismissal without saying whether the user
    // delivered or cancelled, so either outcome returns to the source.
    if (sheetClosed && returnTo && !controller.signal.aborted) router.dismissTo(returnTo);
  };

  return (
    <View className="min-h-0 flex-1">
      {state.status === 'markdown' ? (
        <ScrollView className="flex-1" contentContainerClassName="px-6 py-4">
          <DocumentExportTextPreview key={revision} document={session.document} />
        </ScrollView>
      ) : artifact ? (
        <ArtifactPreview
          key={artifact.id}
          artifact={artifact}
          onError={previewFallback}
          width={Math.min(presentation.width, Math.max(1, windowWidth - left - right - 48))}
        />
      ) : (
        <View className="flex-1 overflow-hidden">
          {/* Keep capture laid out and mounted beneath the opaque loading surface. Its
              wrapper is captured independently; controls never enter the exported bitmap. */}
          <ScrollView
            accessibilityElementsHidden
            className="absolute inset-0"
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            removeClippedSubviews={false}
          >
            {surface}
          </ScrollView>
          <ScrollView
            className="flex-1 bg-background"
            contentContainerClassName="flex-grow items-center justify-center p-6"
          >
            {state.status === 'paused' ? (
              <ContentState.Empty
                primaryAction={{ children: t('documentExport.resume'), onPress: retry }}
                title={t('documentExport.paused')}
              />
            ) : (
              <ContentState.Loading
                title={
                  state.status === 'loading' && typeof state.progress === 'object'
                    ? t('documentExport.progress.images', state.progress)
                    : t(
                        `documentExport.progress.${state.status === 'loading' ? state.progress : 'rendering'}`,
                      )
                }
              />
            )}
          </ScrollView>
        </View>
      )}
      <View className="gap-3 px-6 pt-2" style={{ paddingBottom: Math.max(bottom, 12) }}>
        {imageCount > 1 ? (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-sm">
            {t('documentExport.imageCount', { count: imageCount })}
          </Text>
        ) : null}
        {(state.status === 'ready' || state.status === 'markdown') && state.fallback ? (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-sm">
            {t('documentExport.documentReady')}
          </Text>
        ) : null}
        {artifact && artifact.issues.length > 0 ? (
          <Text className="text-muted-foreground text-sm">
            {t('documentExport.issues', { count: artifact.issues.length })}
          </Text>
        ) : null}
        <View className="min-h-11 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border border-t pt-2">
          <ExportFormatMenu disabled={isSharing} format={activeFormat} onSelect={selectFormat} />
          {option ? (
            <View className="min-h-11 flex-row items-center gap-3">
              <Text className="text-muted-foreground text-sm">{option.label}</Text>
              <Switch
                accessibilityLabel={option.label}
                disabled={isSharing}
                onValueChange={(value) => {
                  if (!sharing.current)
                    setSelection((current) => ({
                      ...current,
                      isOptionChecked: value,
                      revision: current.revision + 1,
                    }));
                }}
                size="sm"
                value={isOptionChecked}
              />
            </View>
          ) : null}
        </View>
        <Button
          disabled={!isReady || isSharing}
          icon={<ShareIcon />}
          loading={isSharing}
          onPress={() => void share()}
          size="lg"
        >
          {imageCount > 1
            ? t('documentExport.shareImages', { count: imageCount })
            : t(activeFormat === 'image' ? 'documentExport.shareImage' : 'documentExport.share')}
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

function ArtifactPreview({
  artifact,
  width,
  onError,
}: {
  artifact: DocumentExportArtifact;
  width: number;
  onError(): void;
}) {
  if (artifact.format === 'html')
    return (
      <WebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        incognito
        javaScriptEnabled={false}
        onError={onError}
        onContentProcessDidTerminate={onError}
        onRenderProcessGone={onError}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        originWhitelist={['*']}
        sharedCookiesEnabled={false}
        source={{ html: artifact.html }}
        style={{ width, alignSelf: 'center', backgroundColor: 'transparent' }}
        thirdPartyCookiesEnabled={false}
      />
    );
  if (artifact.format !== 'image') return null;
  return (
    <LegendList
      data={artifact.images}
      dataKey={artifact.id}
      extraData={{ width, onError }}
      getFixedItemSize={(item) => (width * item.height) / item.width + 32}
      keyExtractor={imageKey}
      recycleItems
      renderItem={renderImage}
      style={{ flex: 1 }}
    />
  );
}

function imageKey(image: ExportImage) {
  return image.file.uri;
}

function renderImage({ item, index, data, extraData }: LegendListRenderItemProps<ExportImage>) {
  const { width, onError } = extraData as { width: number; onError(): void };
  return (
    <ImagePreviewRow
      image={item}
      index={index}
      count={data.length}
      width={width}
      onError={onError}
    />
  );
}

function ImagePreviewRow({
  image,
  index,
  count,
  width,
  onError,
}: {
  image: ExportImage;
  index: number;
  count: number;
  width: number;
  onError(): void;
}) {
  const { t } = useTranslation();
  return (
    <View className="items-center py-4">
      <Image
        accessibilityLabel={t('documentExport.imagePage', { index: index + 1, count })}
        cachePolicy="disk"
        contentFit="contain"
        onError={onError}
        recyclingKey={image.file.uri}
        source={{ uri: image.file.uri }}
        style={{ width, height: (width * image.height) / image.width }}
      />
    </View>
  );
}

function closeExport() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
