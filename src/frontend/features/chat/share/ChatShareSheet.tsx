import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import {
  BottomSheet,
  Button,
  ContentState,
  Spinner,
  Switch,
  useToast,
} from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import {
  FileSharingError,
  shareFiles,
  useExportWatermarkStyle,
  useSaveImagesToPhotos,
} from '@/frontend/appShell/fileExport';
import type {
  ExportFormat,
  ExportImageLayout,
  ExportPresentation,
} from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import {
  useChatShareSelectionActions,
  useChatShareSelectionCount,
  useChatShareSelectionState,
} from './ChatShareSelectionProvider';
import { ArtifactPreview, MarkdownPreview } from './export/components/ExportPreview';
import { useDocumentExportHtmlCapture } from './export/hooks/useDocumentExportHtmlCapture';
import { useDocumentExportPreview } from './export/hooks/useDocumentExportPreview';
import { ShareImageCarousel } from './ShareImageCarousel';
import { useChatSharePresentation } from './useChatSharePresentation';

type SharePage = 'preview' | 'selection' | 'options';
const FORMAT_LABELS = {
  image: 'documentExport.formats.image',
  html: 'documentExport.formats.html',
  markdown: 'documentExport.formats.markdown',
} as const;

export function ChatShareSheet({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { width } = useWindowDimensions();
  const { content, error, isSharing: isPreparing } = useChatShareSelectionState();
  const { confirmSelection, resetSelection } = useChatShareSelectionActions();
  const count = useChatShareSelectionCount();
  const [page, setPage] = useState<SharePage>(() => (count ? 'preview' : 'selection'));
  const [format, setFormat] = useState<ExportFormat>('image');
  const [imageLayout, setImageLayout] = useState<ExportImageLayout>('pages');
  const [includeProcess, setIncludeProcess] = useState(false);
  const defaultWatermark = useExportWatermarkStyle();
  const [watermark, setWatermark] = useState<ExportWatermarkStyle>(defaultWatermark);
  const presentations = useChatSharePresentation(watermark);
  const [deliveryPresentation, setDeliveryPresentation] = useState<ExportPresentation>();
  const presentation =
    deliveryPresentation ?? (format === 'image' ? presentations.image : presentations.document);
  const session =
    !includeProcess && content?.withoutProcess ? content.withoutProcess : content?.session;
  const { capture, surface, onCaptureLayout, revision } = useDocumentExportHtmlCapture();
  const { state, getArtifact, retry } = useDocumentExportPreview(
    session,
    format,
    presentation,
    capture,
    revision,
    imageLayout,
  );
  const [delivery, setDelivery] = useState<'photos' | 'share'>();
  const delivering = useRef<AbortController | undefined>(undefined);
  const saveImages = useSaveImagesToPhotos({ watermark });
  useEffect(() => () => delivering.current?.abort(), []);
  const busy = Boolean(delivery) || isPreparing;
  const ready = Boolean(content) && (state.status === 'ready' || state.status === 'markdown');
  const artifact = state.status === 'ready' ? state.artifact : undefined;
  const markdown =
    state.status === 'markdown'
      ? state.text
      : artifact?.format === 'markdown'
        ? artifact.text
        : undefined;
  const activeFormat = state.status === 'markdown' ? 'markdown' : (artifact?.format ?? format);
  const previewWidth = Math.max(1, Math.min(width, 720) - 40);
  const applySelection = async () => {
    if (await confirmSelection()) setPage('preview');
  };
  const back = () => {
    if (busy) return;
    if (page === 'selection') resetSelection();
    setPage('preview');
  };
  const previewFallback = () => {
    if (!delivering.current) setFormat(activeFormat === 'image' ? 'html' : 'markdown');
  };
  const deliver = async (destination: 'photos' | 'share') => {
    if (delivering.current || !ready || !session || isPreparing) return;
    const controller = new AbortController();
    delivering.current = controller;
    setDelivery(destination);
    setDeliveryPresentation(presentation);
    try {
      if (destination === 'photos') {
        const selected = await getArtifact(controller.signal);
        if (selected.format !== 'image') return;
        const files = await session.save(selected, controller.signal);
        await saveImages(
          files.map((file) => ({ uri: file.uri, provenance: file.entry.provenance })),
          controller.signal,
        );
      } else {
        await shareFiles(
          async () => {
            const selected = await getArtifact(controller.signal);
            return session.save(selected, controller.signal);
          },
          { watermark: presentation.watermark ?? { kind: 'none' }, signal: controller.signal },
        );
      }
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
      delivering.current = undefined;
      if (!controller.signal.aborted) {
        setDelivery(undefined);
        setDeliveryPresentation(undefined);
      }
    }
  };
  const loading = <ContentState.Loading title={t('documentExport.progress.rendering')} />;
  const preview =
    isPreparing || state.status === 'loading' ? (
      loading
    ) : markdown !== undefined && session ? (
      <MarkdownPreview
        session={session}
        presentation={presentation}
        text={markdown}
        width={previewWidth}
      />
    ) : artifact ? (
      artifact.format === 'image' ? (
        <ShareImageCarousel
          key={artifact.id}
          artifact={artifact}
          disabled={busy}
          onError={previewFallback}
        />
      ) : (
        <ArtifactPreview artifact={artifact} width={previewWidth} onError={previewFallback} />
      )
    ) : (
      <View className="flex-1 justify-center p-5">
        {state.status === 'paused' ? (
          <ContentState.Empty
            title={t('documentExport.paused')}
            primaryAction={{ children: t('documentExport.resume'), onPress: retry }}
          />
        ) : (
          loading
        )}
      </View>
    );
  const title =
    page === 'selection'
      ? t('chat.share.selectMessages')
      : page === 'options'
        ? t('chat.share.options')
        : t('chat.share.title');
  const footer =
    page === 'selection' ? (
      <View className="gap-3">
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-muted-foreground text-sm"
        >
          {t('common.selection.count', { count })}
        </Text>
        <Button
          disabled={!count || busy}
          loading={isPreparing}
          onPress={() => void applySelection()}
          testID="chat-share-confirm"
        >
          {t('common.done')}
        </Button>
      </View>
    ) : page === 'options' ? (
      <View className="gap-3">
        <Button disabled={busy} onPress={back}>
          {t('common.done')}
        </Button>
      </View>
    ) : (
      <View className="gap-3">
        {state.status === 'ready' || state.status === 'markdown' ? (
          state.fallback ? (
            <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-xs">
              {t('documentExport.documentReady')}
            </Text>
          ) : null
        ) : null}
        {artifact?.issues.length ? (
          <Text className="text-muted-foreground text-xs">
            {t('documentExport.issues', { count: artifact.issues.length })}
          </Text>
        ) : null}
        <View className="flex-row gap-2">
          <ShareAction
            label={t('chat.share.save')}
            disabled={busy || !ready || activeFormat !== 'image'}
            icon={<DownloadIcon className="size-4 text-foreground" />}
            loading={delivery === 'photos'}
            onPress={() => void deliver('photos')}
          />
          <ShareAction
            label={t('chat.share.exportFile')}
            disabled={busy || !content}
            icon={<FileTextIcon className="size-4 text-foreground" />}
            onPress={() => setPage('options')}
          />
          <ShareAction
            label={t('chat.share.share')}
            disabled={busy || !ready}
            icon={<ShareIcon className="size-4 text-foreground" />}
            loading={delivery === 'share'}
            onPress={() => void deliver('share')}
          />
        </View>
      </View>
    );
  return (
    <BottomSheet
      open
      size="full"
      title={title}
      titleAlign="center"
      onClose={closeChatShare}
      dismissible={!delivery}
      closeAction={{ accessibilityLabel: t('common.close') }}
      backAction={
        page !== 'preview' && content
          ? { accessibilityLabel: t('common.back'), onPress: back }
          : undefined
      }
      footer={footer}
    >
      <View className="min-h-0 flex-1" onLayout={onCaptureLayout}>
        <ScrollView
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          removeClippedSubviews={false}
        >
          {surface}
        </ScrollView>
        <View className="min-h-0 flex-1 bg-background dark:bg-popover">
          <View className="absolute inset-0 dark:bg-secondary" pointerEvents="none" />
          {page === 'selection' ? (
            children
          ) : page === 'options' ? (
            <ScrollView contentContainerClassName="gap-6 px-5 py-4">
              <View className="gap-3">
                <Text className="font-medium text-foreground">{t('documentExport.format')}</Text>
                <View className="flex-row gap-2">
                  {(['image', 'html', 'markdown'] as const).map((value) => (
                    <View key={value} className="flex-1">
                      <Button
                        disabled={busy}
                        onPress={() => setFormat(value)}
                        size="sm"
                        variant={format === value ? 'default' : 'secondary'}
                      >
                        {t(FORMAT_LABELS[value])}
                      </Button>
                    </View>
                  ))}
                </View>
              </View>
              {format === 'image' ? (
                <View className="gap-3">
                  <Text className="font-medium text-foreground">
                    {t('documentExport.imageLayout')}
                  </Text>
                  <View className="flex-row gap-2">
                    {(['pages', 'single'] as const).map((value) => (
                      <View key={value} className="flex-1">
                        <Button
                          disabled={busy}
                          onPress={() => setImageLayout(value)}
                          size="sm"
                          variant={imageLayout === value ? 'default' : 'secondary'}
                        >
                          {t(
                            value === 'pages'
                              ? 'documentExport.imageLayouts.pages'
                              : 'documentExport.imageLayouts.single',
                          )}
                        </Button>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
              {content?.withoutProcess ? (
                <ShareOption
                  label={t('chat.share.includeProcess')}
                  value={includeProcess}
                  disabled={busy}
                  onChange={setIncludeProcess}
                />
              ) : null}
              <ShareOption
                label={t('settings.exportWatermark.title')}
                value={watermark === 'cherry'}
                disabled={busy}
                onChange={(value) => setWatermark(value ? 'cherry' : 'none')}
              />
            </ScrollView>
          ) : !content ? (
            <View className="flex-1 justify-center p-5">
              {error ? (
                <ContentState.Error
                  title={error}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void confirmSelection(),
                  }}
                  secondaryAction={{
                    children: t('chat.share.editSelection'),
                    onPress: () => setPage('selection'),
                  }}
                />
              ) : (
                loading
              )}
            </View>
          ) : (
            <>
              {page === 'preview' ? (
                <View className="flex-row items-center justify-between gap-3 px-5 pb-2">
                  <Text className="text-muted-foreground text-sm">
                    {t('common.selection.count', { count: content.messageIds.length })}
                  </Text>
                  <Button
                    disabled={busy}
                    size="sm"
                    variant="ghost"
                    onPress={() => setPage('selection')}
                  >
                    {t('chat.share.editSelection')}
                  </Button>
                </View>
              ) : null}
              <View className="min-h-0 flex-1 px-5 pb-3">{preview}</View>
            </>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

function ShareOption({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-4">
      <Text className="flex-1 text-foreground">{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}

export function closeChatShare() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function ShareAction({
  label,
  icon,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  loading?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg active:bg-secondary disabled:opacity-40"
    >
      {loading ? <Spinner size="sm" /> : icon}
      <Text className="text-foreground text-sm">{label}</Text>
    </Pressable>
  );
}
