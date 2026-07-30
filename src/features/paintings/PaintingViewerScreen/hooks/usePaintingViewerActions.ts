import { useQueryClient } from '@tanstack/react-query';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/data/api';
import type { Painting } from '@/data/types/painting';
import { useDataServices } from '@/runtime';
import { createPaintingDraftHandoff } from '../../utils/paintingDraftHandoff';
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const services = useDataServices();

  const download = useCallback(async () => {
    try {
      // Write-only (add-only) access is enough to save; the legacy
      // saveToLibraryAsync throws in SDK 57, so use the class-based Asset.create.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        toast.show({ label: t('painting.viewer.savePermissionDenied'), variant: 'danger' });
        return;
      }
      await MediaLibrary.Asset.create(currentOutput.uri);
      toast.show({ label: t('painting.viewer.saved'), variant: 'success' });
    } catch {
      toast.show({ label: t('painting.viewer.saveFailed'), variant: 'danger' });
    }
  }, [currentOutput, t, toast]);

  const remove = useCallback(async () => {
    try {
      await services.painting.delete(painting.id);
      router.back();
      // Drop (not invalidate) the detail entry: a refetch would getById a
      // deleted row and throw. The masonry's gallery query keys derive from
      // list data, so invalidating the list refreshes it too.
      queryClient.removeQueries({ queryKey: queryKeys.paintings.detail(painting.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() });
    } catch {
      toast.show({ label: t('painting.viewer.deleteFailed'), variant: 'danger' });
    }
  }, [painting.id, queryClient, router, services.painting, t, toast]);

  // Both edit and resize reopen the composer seeded with the current output as an
  // input attachment; paintingId additionally preselects the painting's model.
  // Edit leaves the prompt blank for the user to write fresh. Resize seeds it
  // with just the aspect-ratio directive, and the user reviews and sends it
  // manually.
  const openComposer = useCallback(
    (draft: string) => {
      const handoff = createPaintingDraftHandoff({
        attachments: [createPaintingOutputAttachmentDraft(currentOutput)],
        draft,
      });
      router.push({ pathname: '/paintings', params: { handoff, paintingId: painting.id } });
    },
    [currentOutput, painting.id, router],
  );

  const edit = useCallback(() => openComposer(''), [openComposer]);

  const resize = useCallback(
    (ratio: string) => openComposer(t('painting.viewer.resizePrompt', { ratio })),
    [openComposer, t],
  );

  const viewConversation = useCallback(() => {
    router.push({
      params: { paintingId: painting.id },
      pathname: '/paintings/[paintingId]/conversation',
    });
  }, [painting.id, router]);

  return { download, edit, remove, resize, viewConversation };
}
