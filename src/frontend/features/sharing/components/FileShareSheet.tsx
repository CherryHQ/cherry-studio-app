import { CardStack, ContentState, Image, useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  FileSharingError,
  prepareSharedFile,
  shareFiles,
  useExportWatermark,
  useSaveImagesToPhotos,
} from '@/frontend/appShell/fileExport';
import { getShareRequest, retainShareOperation } from '@/frontend/appShell/sharing';
import {
  fileEntryPreviewKind,
  LoadedFileEntryPreview,
} from '@/frontend/components/FileEntryPreview';
import type { HtmlConversionArtifact } from '@/shared/contracts/documentExport';
import { DocumentExportError, HTML_CONVERSION_MAX_PAGES } from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { ExportWatermark } from '@/shared/contracts/fileExport';

import { useHtmlConversion } from '../hooks/useHtmlConversion';
import { ShareFormatMenu, type ShareFormat } from './ShareFormatMenu';
import { ShareSheet } from './ShareSheet';

type Request = Extract<NonNullable<ReturnType<typeof getShareRequest>>, { kind: 'files' }>;
type Preview = { uri: string; name: string; original?: ResolvedFile };

export function FileShareSheet({ request, onClose }: { request: Request; onClose(): void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [format, setFormat] = useState<ShareFormat>('original');
  const [watermark, setWatermark] = useState(request.watermark);
  const [index, setIndex] = useState(0);
  const canConvert =
    request.allowConversion &&
    request.files.every((file) => fileEntryPreviewKind(file.entry) === 'html');
  const areImages = request.files.every((file) => fileEntryPreviewKind(file.entry) === 'image');
  const createWatermark = useExportWatermark(watermark);
  const { convert, surface } = useHtmlConversion(request.id);
  const [conversion, setConversion] = useState<{
    format: ShareFormat;
    watermark: string;
    artifacts: readonly HtmlConversionArtifact[];
    error?: unknown;
  }>();
  const [attempt, setAttempt] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const savePhotos = useSaveImagesToPhotos();
  const convertFiles = useCallback(
    async (signature: ExportWatermark, signal: AbortSignal) => {
      const artifacts: HtmlConversionArtifact[] = [];
      for (const file of request.files) {
        const artifact = await convert(
          file,
          format === 'pptx' ? 'pptx' : 'image',
          signature,
          signal,
        );
        artifacts.push(artifact);
        if (artifacts.reduce((sum, item) => sum + item.pages.length, 0) > HTML_CONVERSION_MAX_PAGES)
          throw new DocumentExportError('size-limit');
      }
      return artifacts;
    },
    [convert, format, request.files],
  );
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (format === 'original' || !canConvert) return;
    const controller = new AbortController();
    void retainShareOperation(
      request.id,
      (async () => {
        try {
          const artifacts = await convertFiles(createWatermark(), controller.signal);
          if (!controller.signal.aborted) setConversion({ format, watermark, artifacts });
        } catch (error) {
          if (!controller.signal.aborted)
            setConversion({ format, watermark, artifacts: [], error });
        }
      })(),
    );
    return () => controller.abort();
  }, [attempt, canConvert, convertFiles, createWatermark, format, request.id, watermark]);
  const current =
    conversion?.format === format && conversion.watermark === watermark ? conversion : undefined;
  const isConverting = format !== 'original' && !current;
  const originals: Preview[] = request.files.map((file) => ({
    uri: file.uri,
    name: file.entry.filename,
    original: file,
  }));
  const previews: Preview[] =
    format === 'original'
      ? originals
      : (current?.artifacts.flatMap((artifact) =>
          artifact.pages.map((page) => ({ uri: page.file.uri, name: artifact.file.filename })),
        ) ?? []);
  const perform = (action: 'share' | 'save') => {
    if (pending.current || isConverting || current?.error) return;
    const controller = new AbortController();
    pending.current = controller;
    setIsPending(true);
    void retainShareOperation(
      request.id,
      (async () => {
        try {
          if (action === 'share')
            await shareFiles(
              format === 'original'
                ? request.files
                : current!.artifacts.map((artifact) => artifact.file),
              {
                watermark: format === 'original' ? createWatermark() : { kind: 'none' },
                signal: controller.signal,
              },
            );
          else if (format === 'original' || format === 'image')
            await savePhotos((signal) =>
              retainShareOperation(
                request.id,
                (async () => {
                  signal.throwIfAborted();
                  if (format === 'original')
                    return request.files.map((file) => ({
                      uri: file.uri,
                    }));
                  const images: { uri: string }[] = [];
                  const artifacts = await convertFiles({ kind: 'none' }, signal);
                  for (const artifact of artifacts)
                    images.push(
                      await prepareSharedFile(artifact.file, {
                        watermark: { kind: 'none' },
                        signal,
                      }),
                    );
                  return images;
                })(),
              ),
            );
          else {
            const artifacts = await convertFiles({ kind: 'none' }, controller.signal);
            for (const artifact of artifacts) await artifact.save(controller.signal);
            toast.show({ label: t('sharing.savedToLibrary'), variant: 'success' });
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
          if (pending.current === controller) pending.current = undefined;
          if (!controller.signal.aborted) setIsPending(false);
        }
      })(),
    );
  };
  const renderItem = useCallback((item: Preview, frame: { width: number }) => {
    const previewSize = Math.max(48, Math.min(112, frame.width - 32));
    return item.original && fileEntryPreviewKind(item.original.entry) !== 'image' ? (
      <View className="flex-1 items-center justify-center gap-5 px-4" pointerEvents="none">
        <LoadedFileEntryPreview
          entry={item.original.entry}
          previewUri={undefined}
          uri={item.original.uri}
          size={previewSize}
          iconSize={(previewSize / 112) * 60}
          variant="icon"
        />
        <Text className="text-center font-medium text-base text-foreground" numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    ) : (
      <Image
        source={{ uri: item.uri }}
        contentFit="contain"
        className="h-full w-full bg-card"
        recyclingKey={item.uri}
      />
    );
  }, []);
  return (
    <ShareSheet
      isPending={isPending || isConverting}
      canShare={!current?.error}
      onClose={() => {
        pending.current?.abort();
        onClose();
      }}
      onShare={() => perform('share')}
      onSave={areImages || format !== 'original' ? () => perform('save') : undefined}
      saveLabel={t(
        format === 'original' || format === 'image'
          ? 'sharing.saveToPhotos'
          : 'sharing.saveToLibrary',
      )}
      headerAction={
        canConvert ? (
          <ShareFormatMenu
            formats={['original', 'image', 'pptx']}
            format={format}
            disabled={isPending}
            onSelect={(next) => {
              if (pending.current) return;
              setFormat(next);
              setIndex(0);
            }}
            watermark={watermark !== 'none'}
            onWatermarkChange={
              format !== 'original'
                ? () => setWatermark((value) => (value === 'none' ? 'cherry' : 'none'))
                : undefined
            }
          />
        ) : undefined
      }
    >
      <View className="min-h-0 flex-1">
        <ScrollView
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          removeClippedSubviews={false}
        >
          {surface}
        </ScrollView>
        <View className="min-h-0 flex-1 bg-background px-4 pb-2 dark:bg-popover">
          {current?.error ? (
            <View className="flex-1 justify-center p-6">
              <ContentState.Error
                title={t(
                  current.error instanceof DocumentExportError &&
                    ['size-limit', 'image-size-limit'].includes(current.error.code)
                    ? 'sharing.tooLarge'
                    : 'fileViewer.conversion.failed',
                )}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => setAttempt((value) => value + 1),
                }}
              />
            </View>
          ) : isConverting ? (
            <View className="flex-1 justify-center">
              <ContentState.Loading />
            </View>
          ) : (
            <CardStack
              items={previews}
              index={index}
              onIndexChange={setIndex}
              renderItem={renderItem}
              labels={{
                previous: t('sharing.previous'),
                next: t('sharing.next'),
                page: (page, total) => t('documentExport.page', { page, total }),
              }}
            />
          )}
        </View>
      </View>
    </ShareSheet>
  );
}
