import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useSaveImageToPhotos, useShareFile } from '@/frontend/appShell/fileExport';
import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { useDeletePaintings } from '@/frontend/data/paintings/usePaintings';
import { createPaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';
import { isUniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';
import type { ImageParamDraft } from '@/shared/utils/imageGenerationParams';

import { createPaintingOutputAttachmentDraft } from '../../utils/paintingOutputAttachment';
import { editPaintingWorkspace, hasPaintingWorkspace } from '../../utils/paintingWorkspaceSession';

type ViewerOutput = { fileEntryId: string; uri: string };

export function usePaintingViewerActions({
  currentOutput,
  painting,
  workspaceId,
}: {
  currentOutput: ViewerOutput;
  painting: Painting;
  workspaceId?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const router = useRouter();
  const deletePaintings = useDeletePaintings();

  const file = useResolvedFile(currentOutput.fileEntryId);
  const { isSharing, share } = useShareFile(file.data);
  const canShare = Boolean(file.data) && !isSharing;

  const download = useSaveImageToPhotos({
    uri: currentOutput.uri,
    provenance: file.data?.entry.provenance,
  });

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

  // Return to the live workspace when available, preserving authored drafts.
  // Independent viewers seed a new composer with this output and its model.
  // Resize supplies a dimension directive; the user reviews and sends it manually.
  const openComposer = useCallback(
    (draft: string, paramValues?: ImageParamDraft) => {
      if (
        editPaintingWorkspace(workspaceId, {
          output: currentOutput,
          ...(draft ? { draft } : {}),
          ...(paramValues ? { paramValues } : {}),
          ...(paramValues && painting.modelId && isUniqueModelId(painting.modelId)
            ? { modelId: painting.modelId }
            : {}),
        })
      ) {
        router.back();
        return;
      }
      const handoff = createPaintingDraftHandoff({
        attachments: [createPaintingOutputAttachmentDraft(currentOutput)],
        draft,
        ...(paramValues ? { paramValues } : {}),
      });
      router.push({ pathname: '/paintings', params: { handoff, paintingId: painting.id } });
    },
    [currentOutput, painting.id, painting.modelId, router, workspaceId],
  );

  const edit = useCallback(() => openComposer(''), [openComposer]);

  const resize = useCallback(
    (ratio: string, paramValues: ImageParamDraft = { aspectRatio: ratio }) =>
      openComposer(t('painting.viewer.resizePrompt', { ratio }), paramValues),
    [openComposer, t],
  );

  const viewConversation = useCallback(() => {
    if (hasPaintingWorkspace(workspaceId)) {
      router.back();
      return;
    }
    router.push({
      params: { paintingId: painting.id },
      pathname: '/paintings',
    });
  }, [painting.id, router, workspaceId]);

  return { canShare, download, edit, remove, resize, share, viewConversation };
}
