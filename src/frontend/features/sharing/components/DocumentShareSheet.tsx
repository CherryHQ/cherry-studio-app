import { CardStack, ContentState, useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  FileSharingError,
  prepareSharedFile,
  shareFiles,
  useSaveImagesToPhotos,
} from '@/frontend/appShell/fileExport';
import { getShareRequest, retainShareOperation } from '@/frontend/appShell/sharing';
import type { ExportFormat, ExportPresentation } from '@/shared/contracts/documentExport';
import { DocumentExportError } from '@/shared/contracts/documentExport';

import { useDocumentExportHtmlCapture } from '../hooks/useDocumentExportHtmlCapture';
import { useDocumentExportPreview } from '../hooks/useDocumentExportPreview';
import { useExportPresentation } from '../hooks/useExportPresentation';
import { DocumentFilePreview } from './DocumentFilePreview';
import { DocumentPagePreview } from './DocumentPagePreview';
import { ShareFormatTabs } from './ShareFormatTabs';
import { ShareSheet } from './ShareSheet';

type Request = Extract<NonNullable<ReturnType<typeof getShareRequest>>, { kind: 'document' }>;

export function DocumentShareSheet({ request, onClose }: { request: Request; onClose(): void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [format, setFormat] = useState(request.initialFormat);
  const [index, setIndex] = useState(0);
  const isMessageCard = request.session.document.sections.some((section) =>
    Boolean(section.presentation),
  );
  const livePresentation = useExportPresentation(
    request.watermark,
    format === 'image',
    isMessageCard,
  );
  const [deliveryPresentation, setDeliveryPresentation] = useState<ExportPresentation>();
  const presentation = deliveryPresentation ?? livePresentation;
  const { capture, surface, onCaptureLayout } = useDocumentExportHtmlCapture();
  const preview = useDocumentExportPreview(request.session, format, presentation, capture);
  const error = preview.error;
  const isSizeLimit =
    error instanceof DocumentExportError && ['size-limit', 'image-size-limit'].includes(error.code);
  const [isPending, setIsPending] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const savePhotos = useSaveImagesToPhotos();
  useEffect(() => () => pending.current?.abort(), []);
  const perform = (action: 'share' | 'save') => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setIsPending(true);
    setDeliveryPresentation(presentation);
    void retainShareOperation(
      request.id,
      (async () => {
        try {
          if (action === 'share')
            await shareFiles(
              async () => {
                const artifact = await preview.getArtifact(controller.signal);
                return artifact.format === 'image'
                  ? artifact.pages.map((page) => page.file)
                  : [artifact.file];
              },
              { signal: controller.signal, watermark: { kind: 'none' } },
            );
          else {
            const artifact = await preview.getArtifact(controller.signal, {
              watermark: { kind: 'none' },
            });
            await request.session.save(artifact, controller.signal);
            controller.signal.throwIfAborted();
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
          if (!controller.signal.aborted) {
            setIsPending(false);
            setDeliveryPresentation(undefined);
          }
        }
      })(),
    );
  };
  const saveImages = () => {
    if (pending.current) return;
    void savePhotos((signal) =>
      retainShareOperation(
        request.id,
        (async () => {
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal.throwIfAborted();
          signal.addEventListener('abort', abort, { once: true });
          pending.current = controller;
          setIsPending(true);
          setDeliveryPresentation(presentation);
          try {
            const artifact = await preview.getArtifact(controller.signal, {
              watermark: { kind: 'none' },
            });
            if (artifact.format !== 'image') throw new Error('Expected image output');
            const images: { uri: string }[] = [];
            for (const page of artifact.pages)
              images.push(
                await prepareSharedFile(page.file, {
                  signal: controller.signal,
                  watermark: { kind: 'none' },
                }),
              );
            return images;
          } finally {
            signal.removeEventListener('abort', abort);
            if (pending.current === controller) pending.current = undefined;
            if (!controller.signal.aborted) {
              setIsPending(false);
              setDeliveryPresentation(undefined);
            }
          }
        })(),
      ),
    );
  };
  return (
    <ShareSheet
      isPending={isPending}
      canShare={!preview.isPreparing && !error}
      onClose={() => {
        pending.current?.abort();
        onClose();
      }}
      onShare={() => perform('share')}
      onSave={format === 'image' ? saveImages : () => perform('save')}
      saveLabel={t(format === 'image' ? 'sharing.saveToPhotos' : 'sharing.saveToLibrary')}
      formatControls={
        <ShareFormatTabs
          disabled={isPending}
          formats={request.allowedFormats}
          format={format}
          onSelect={(value) => {
            if (pending.current) return;
            setFormat(value as ExportFormat);
            setIndex(0);
          }}
        />
      }
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
        <View className="min-h-0 flex-1 px-4 pt-2.5">
          {preview.issues.length ? (
            <Text
              accessibilityLiveRegion="polite"
              className="px-2 pt-2 text-muted-foreground text-xs"
            >
              {t('documentExport.issues', { count: preview.issues.length })}
            </Text>
          ) : null}
          {error ? (
            <View className="flex-1 justify-center p-6">
              <ContentState.Error
                title={t(
                  isSizeLimit
                    ? 'sharing.tooLarge'
                    : preview.isPaused
                      ? 'documentExport.paused'
                      : 'documentExport.deliveryFailed',
                )}
                primaryAction={{ children: t('common.retry'), onPress: preview.retry }}
              />
            </View>
          ) : preview.isPreparing ? (
            <View className="flex-1 justify-center p-6">
              <ContentState.Loading />
            </View>
          ) : (
            <CardStack
              layout="fill"
              items={preview.pages}
              index={index}
              onIndexChange={setIndex}
              labels={{
                previous: t('sharing.previous'),
                next: t('sharing.next'),
                page: (page, total) => t('documentExport.page', { page, total }),
              }}
              renderItem={(page, frame) => {
                if (!frame.isFront) return <View className="flex-1 bg-card" />;
                const content = (
                  <DocumentPagePreview
                    html={preview.html}
                    page={page}
                    width={frame.width}
                    height={frame.height}
                    isImage={format === 'image'}
                    layout={presentation.imageFrame?.layout ?? 'pages'}
                    onPages={preview.onPages}
                    onError={preview.onPreviewError}
                  />
                );
                return format === 'image' ? (
                  content
                ) : (
                  <DocumentFilePreview
                    filename={
                      preview.filename ??
                      `${request.session.document.title ?? t('documentExport.document')}.${format === 'markdown' ? 'md' : 'html'}`
                    }
                    messageCount={
                      isMessageCard ? request.session.document.sections.length : undefined
                    }
                    source={format === 'markdown' ? preview.text : preview.html}
                    format={format}
                  >
                    {content}
                  </DocumentFilePreview>
                );
              }}
            />
          )}
        </View>
      </View>
    </ShareSheet>
  );
}
