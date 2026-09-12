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
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ScopedTheme } from 'uniwind';

import {
  claimDocumentExportRequest,
  getDocumentExportRequest,
  scheduleDocumentExportFinish,
  type DocumentExportOption,
} from '@/frontend/appShell/documentExport';
import { shareFile } from '@/frontend/components/FileEntryPreview';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type {
  DocumentExportArtifact,
  DocumentExportSession,
  ExportDocument,
  ExportFormat,
} from '@/shared/contracts/documentExport';

import { useDocumentExportHtmlCapture } from './components/DocumentExportHtmlSurface';
import { DocumentExportTextPreview } from './components/DocumentExportTextPreview';
import { useDocumentExportPreview } from './hooks/useDocumentExportPreview';
import { IMAGE_FRAME_BRAND } from './utils/imageFrameBrand';

export function DocumentExportScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const id = getSingleRouteParam(params.requestId);
  return (
    <ScopedTheme theme="dark">
      <DocumentExportRoute key={id} requestId={id} />
    </ScopedTheme>
  );
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
        <View className="min-w-11 items-end">
          {request?.session.document.sections.some((section) => section.presentation) ? (
            <Text className="text-muted-foreground text-xs">
              {t('documentExport.messageCount', {
                count: request.session.document.sections.length,
              })}
            </Text>
          ) : null}
        </View>
      </View>
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
    paper,
    ink,
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
    'constant-white',
    'constant-black',
  ]);
  const [presentation] = useState(() => {
    const { base, sm, lg, xl } = resolveTypographyScale(fontStep);
    return {
      width: Math.floor(Math.min(600, Math.max(280, windowWidth))),
      typography: { base, sm, lg, xl },
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
    };
  });
  // Freeze both snapshots' image presentation at opening, just like the base presentation.
  // Changes outside this layer must not replace the artifact while it is being delivered.
  const [imagePresentations] = useState(() => {
    const frameDocument = (document: ExportDocument) => {
      const isConversation = document.sections.some((section) => section.presentation);
      return {
        ...presentation,
        imageFrame: {
          ...IMAGE_FRAME_BRAND,
          background: paper,
          foreground: ink,
          label: t(isConversation ? 'documentExport.conversation' : 'documentExport.document'),
          caption: isConversation
            ? t('documentExport.messageCount', { count: document.sections.length })
            : t('documentExport.document'),
        },
      };
    };
    return {
      checked: frameDocument(checkedSession.document),
      unchecked: option ? frameDocument(option.uncheckedSession.document) : undefined,
    };
  });
  const imagePresentation =
    !isOptionChecked && imagePresentations.unchecked
      ? imagePresentations.unchecked
      : imagePresentations.checked;
  const { capture, surface } = useDocumentExportHtmlCapture();
  const { state, getArtifact, retry } = useDocumentExportPreview(
    session,
    format,
    format === 'image' ? imagePresentation : presentation,
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
    <View className="min-h-0 flex-1">
      {state.status === 'markdown' ? (
        <ScrollView className="flex-1" contentContainerClassName="px-6 py-4">
          <DocumentExportTextPreview key={revision} document={session.document} />
        </ScrollView>
      ) : artifact ? (
        <ArtifactPreview
          key={artifact.id}
          artifact={artifact}
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
          </ScrollView>
        </View>
      )}
      <View className="gap-3 px-6 pt-2" style={{ paddingBottom: Math.max(bottom, 12) }}>
        {artifact && artifact.issues.length > 0 ? (
          <Text className="text-muted-foreground text-sm">
            {t('documentExport.issues', { count: artifact.issues.length })}
          </Text>
        ) : null}
        <View className="min-h-11 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border border-t pt-2">
          <ExportFormatMenu disabled={isSharing} format={format} onSelect={selectFormat} />
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
          {t(format === 'image' ? 'documentExport.shareImage' : 'documentExport.share')}
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
        style={{ width, alignSelf: 'center', backgroundColor: 'transparent' }}
        thirdPartyCookiesEnabled={false}
      />
    );
  if (artifact.format !== 'image') return null;
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="flex-grow items-center justify-center py-4"
    >
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

function closeExport() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
