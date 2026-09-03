import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

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

  const saveToPhotos = useCallback(async () => {
    try {
      await MediaLibrary.Asset.create(currentOutput.uri);
      toast.show({ label: t('painting.viewer.saved'), variant: 'success' });
    } catch {
      toast.show({ label: t('painting.viewer.saveFailed'), variant: 'danger' });
    }
  }, [currentOutput, t, toast]);

  const showOpenSettingsAlert = useCallback(() => {
    alert.confirm({
      confirmLabel: t('settings.permissions.openSystemSettings'),
      description: t('painting.viewer.savePermissionDenied'),
      onConfirm: () =>
        Linking.openSettings().catch(() => {
          toast.show({ label: t('painting.viewer.openSettingsFailed'), variant: 'danger' });
        }),
      title: t('settings.permissions.accessRequired'),
    });
  }, [alert, t, toast]);

  const requestPhotoAccessAndSave = useCallback(async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await saveToPhotos();
      } else if (!permission.canAskAgain) {
        showOpenSettingsAlert();
      } else {
        toast.show({ label: t('painting.viewer.saveAccessDenied'), variant: 'danger' });
      }
    } catch {
      toast.show({ label: t('painting.viewer.saveFailed'), variant: 'danger' });
    }
  }, [saveToPhotos, showOpenSettingsAlert, t, toast]);

  const download = useCallback(async () => {
    try {
      // Write-only (add-only) access is enough to save; the legacy
      // saveToLibraryAsync throws in SDK 57, so use the class-based Asset.create.
      const permission = await MediaLibrary.getPermissionsAsync(true);
      if (permission.granted) {
        await saveToPhotos();
      } else if (permission.canAskAgain) {
        alert.confirm({
          confirmLabel: t('settings.permissions.writeAccess'),
          description: t('painting.viewer.savePermissionDenied'),
          onConfirm: requestPhotoAccessAndSave,
          title: t('settings.permissions.accessRequired'),
        });
      } else {
        showOpenSettingsAlert();
      }
    } catch {
      toast.show({ label: t('painting.viewer.saveFailed'), variant: 'danger' });
    }
  }, [alert, requestPhotoAccessAndSave, saveToPhotos, showOpenSettingsAlert, t, toast]);

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
