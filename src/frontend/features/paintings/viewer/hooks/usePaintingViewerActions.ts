import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useSaveImageToPhotos } from '@/frontend/components/ArtifactPreview';
import type { ImageParamDraft } from '@/frontend/data/paintings/imageGenerationParams';
import { useDeletePaintings } from '@/frontend/data/paintings/usePaintings';
import { createPaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';
import type { Painting } from '@/shared/data/types/painting';

import { createPaintingOutputAttachmentDraft } from '../../utils/paintingOutputAttachment';

type ViewerOutput = { fileEntryId: string; uri: string };

export function usePaintingViewerActions({
  currentOutput,
  painting,
}: {
  currentOutput: ViewerOutput;
  painting: Painting;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const router = useRouter();
  const deletePaintings = useDeletePaintings();

  const download = useSaveImageToPhotos(currentOutput.uri);

  const remove = useCallback(() => {
    const hasMultipleOutputs = painting.files.output.length > 1;
    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t(
        hasMultipleOutputs
          ? 'painting.viewer.deleteGenerationMessage'
          : 'painting.viewer.deleteMessage',
        { count: painting.files.output.length },
      ),
      onConfirm: () => {
        const deletion = deletePaintings([painting.id]);
        router.back();
        void deletion.catch(() => {
          toast.show({ label: t('painting.viewer.deleteFailed'), variant: 'danger' });
        });
      },
      role: 'destructive',
      title: t(
        hasMultipleOutputs
          ? 'painting.viewer.deleteGenerationTitle'
          : 'painting.viewer.deleteTitle',
      ),
    });
  }, [alert, deletePaintings, painting.files.output.length, painting.id, router, t, toast]);

  // Both edit and resize reopen the composer seeded with the current output as an
  // input attachment; paintingId additionally preselects the painting's model.
  // Edit leaves the prompt blank for the user to write fresh. Resize seeds it
  // with just the aspect-ratio directive, and the user reviews and sends it
  // manually.
  const openComposer = useCallback(
    (draft: string, paramValues?: ImageParamDraft) => {
      const handoff = createPaintingDraftHandoff({
        attachments: [createPaintingOutputAttachmentDraft(currentOutput)],
        draft,
        ...(paramValues ? { paramValues } : {}),
      });
      router.push({ pathname: '/paintings', params: { handoff, paintingId: painting.id } });
    },
    [currentOutput, painting.id, router],
  );

  const edit = useCallback(() => openComposer(''), [openComposer]);

  const resize = useCallback(
    (ratio: string) =>
      openComposer(t('painting.viewer.resizePrompt', { ratio }), { aspectRatio: ratio }),
    [openComposer, t],
  );

  const viewConversation = useCallback(() => {
    router.push({
      params: { paintingId: painting.id },
      pathname: '/paintings',
    });
  }, [painting.id, router]);

  return { download, edit, remove, resize, viewConversation };
}
