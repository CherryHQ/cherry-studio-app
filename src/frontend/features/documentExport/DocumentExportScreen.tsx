import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { ActionMenu, Button, ContentState, Switch, useToast } from '@cherrystudio/ui/components';
import { resolveTypographyScale } from '@cherrystudio/ui/utils';
import { type Href, router, useLocalSearchParams } from 'expo-router';
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
import { FileSharingError, shareFiles, useExportWatermark } from '@/frontend/appShell/fileExport';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type {
  DocumentExportArtifact,
  DocumentExportSession,
  ExportDocument,
  ExportFormat,
  ExportImageLayout,
  ExportPresentation,
} from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';
import { formatExportTimestamp } from '@/shared/utils/exportSignature';

import { DocumentExportImagePreview } from './components/DocumentExportImagePreview';
import { DocumentExportTextPreview } from './components/DocumentExportTextPreview';
import { useDocumentExportHtmlCapture } from './hooks/useDocumentExportHtmlCapture';
import { useDocumentExportPreview } from './hooks/useDocumentExportPreview';
import { IMAGE_LAYOUT_WIDTH } from './utils/imagePagePlan';

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
          allowedFormats={request.allowedFormats}
          initialFormat={request.initialFormat}
          option={request.option}
          returnTo={request.returnTo}
          session={request.session}
          watermark={request.watermark}
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
  allowedFormats,
  option,
  returnTo,
  watermark,
}: {
  session: DocumentExportSession;
  initialFormat: ExportFormat;
  allowedFormats: readonly ExportFormat[];
  option?: DocumentExportOption;
  returnTo?: Href;
  watermark: ExportWatermarkStyle;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom, left, right } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [selection, setSelection] = useState({
    format: initialFormat,
    imageLayout: 'pages' as ExportImageLayout,
    isOptionChecked: false,
    revision: 0,
  });
  const { format, imageLayout, isOptionChecked, revision } = selection;
  const session = !isOptionChecked && option ? option.uncheckedSession : checkedSession;
  const [fontStep] = usePreference('ui.font_size_step');
  const createWatermark = useExportWatermark(watermark);
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
  const [timestamp] = useState(() => formatExportTimestamp(new Date()));
  const presentation = useMemo(
    () => ({
      ...layout,
      watermark: createWatermark(timestamp),
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
      createWatermark,
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
      timestamp,
    ],
  );
  const imagePresentations = useMemo(() => {
    const frameDocument = (document: ExportDocument) => {
      const isConversation = document.sections.some((section) => section.presentation);
      return {
        ...presentation,
        width: IMAGE_LAYOUT_WIDTH,
        imageFrame: {
          background,
          label: t(isConversation ? 'documentExport.conversation' : 'documentExport.document'),
        },
      };
    };
    return {
      checked: frameDocument(checkedSession.document),
      unchecked: option ? frameDocument(option.uncheckedSession.document) : undefined,
    };
  }, [background, checkedSession.document, option, presentation, t]);
  const imagePresentation =
    !isOptionChecked && imagePresentations.unchecked
      ? imagePresentations.unchecked
      : imagePresentations.checked;
  // Theme changes regenerate previews, but cannot replace a file while the share sheet uses it.
  const [deliveryPresentation, setDeliveryPresentation] = useState<ExportPresentation>();
  const previewPresentation =
    deliveryPresentation ?? (format === 'image' ? imagePresentation : presentation);
  const { capture, surface, onCaptureLayout } = useDocumentExportHtmlCapture();
  const { state, getArtifact, retry } = useDocumentExportPreview(
    session,
    format,
    previewPresentation,
    capture,
    revision,
    imageLayout,
  );
  const [isSharing, setIsSharing] = useState(false);
  const sharing = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => sharing.current?.abort(), []);
  const isReady = state.status === 'markdown' || state.status === 'ready';
  const artifact = state.status === 'ready' ? state.artifact : undefined;
  const activeFormat = state.status === 'markdown' ? 'markdown' : (artifact?.format ?? format);
  const selectFormat = useCallback(
    (value: ExportFormat) => {
      if (!sharing.current && allowedFormats.includes(value))
        setSelection((current) =>
          activeFormat === value
            ? current
            : { ...current, format: value, revision: current.revision + 1 },
        );
    },
    [activeFormat, allowedFormats],
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
      await shareFiles(
        async () => {
          const selected = await getArtifact(controller.signal);
          return session.save(selected, controller.signal);
        },
        { watermark: previewPresentation.watermark ?? { kind: 'none' }, signal: controller.signal },
      );
      sheetClosed = true;
    } catch (error) {
      if (!controller.signal.aborted)
        toast.show({
          label: t(
            error instanceof FileSharingError
              ? 'fileViewer.shareUnavailable'
              : 'documentExport.deliveryFailed',
          ),
          variant: 'danger',
        });
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
      <View className="min-h-0 flex-1" onLayout={onCaptureLayout}>
        {state.status === 'markdown' ? (
          <ScrollView className="flex-1" contentContainerClassName="px-6 py-4">
            <DocumentExportTextPreview
              key={revision}
              document={session.document}
              watermark={previewPresentation.watermark}
            />
          </ScrollView>
        ) : artifact ? (
          <ArtifactPreview
            key={artifact.id}
            artifact={artifact}
            onError={previewFallback}
            width={Math.max(1, windowWidth - left - right - 48)}
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
                    state.status === 'loading' && typeof state.progress !== 'string'
                      ? t('documentExport.progress.page', {
                          page: state.progress.page,
                          total: state.progress.total,
                        })
                      : t(
                          `documentExport.progress.${state.status === 'loading' ? state.progress : 'rendering'}`,
                        )
                  }
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>
      <View className="gap-3 px-6 pt-2" style={{ paddingBottom: Math.max(bottom, 12) }}>
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
          <ExportFormatMenu
            allowedFormats={allowedFormats}
            disabled={isSharing}
            format={activeFormat}
            onSelect={selectFormat}
          />
          {activeFormat === 'image' ? (
            <ActionMenu
              items={(['pages', 'single'] as const).map((value) => ({
                id: value,
                label: t(`documentExport.imageLayouts.${value}`),
                checked: imageLayout === value,
                disabled: isSharing,
                onPress: () => {
                  if (!sharing.current)
                    setSelection((current) =>
                      current.imageLayout === value
                        ? current
                        : { ...current, imageLayout: value, revision: current.revision + 1 },
                    );
                },
              }))}
            >
              <Button
                accessibilityLabel={`${t('documentExport.imageLayout')}: ${t(`documentExport.imageLayouts.${imageLayout}`)}`}
                disabled={isSharing}
                icon={<ChevronDownIcon size={16} />}
                size="sm"
                variant="ghost"
              >
                {t(`documentExport.imageLayouts.${imageLayout}`)}
              </Button>
            </ActionMenu>
          ) : null}
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
          {artifact?.format === 'image'
            ? t('documentExport.shareImages', { count: artifact.pages.length })
            : t('documentExport.share')}
        </Button>
      </View>
    </View>
  );
}

function ExportFormatMenu({
  allowedFormats,
  disabled,
  format,
  onSelect,
}: {
  allowedFormats: readonly ExportFormat[];
  disabled: boolean;
  format: ExportFormat;
  onSelect(format: ExportFormat): void;
}) {
  const { t } = useTranslation();
  return (
    <ActionMenu
      items={allowedFormats.map((value) => ({
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
  const source = useMemo(
    () => (artifact.format === 'html' ? { html: artifact.html } : undefined),
    [artifact],
  );
  if (artifact.format === 'image')
    return <DocumentExportImagePreview artifact={artifact} onError={onError} width={width} />;
  if (!source) return null;
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
      source={source}
      style={{ width, alignSelf: 'center', backgroundColor: 'transparent' }}
      textZoom={100}
      thirdPartyCookiesEnabled={false}
    />
  );
}

function closeExport() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
