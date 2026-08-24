import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import type { Painting } from '@/shared/data/types/painting';

import { useDeletePaintings } from '../../hooks/usePaintings';
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
  const { alert } = useAlert();
  const router = useRouter();
  const deletePaintings = useDeletePaintings();

  const saveToPhotos = useCallback(async () => {
    try {
      await MediaLibrary.Asset.create(currentOutput.uri);
      toast.show({ label: t('painting.viewer.saved'), variant: 'success' });
    } catch {
      alert.show({ title: t('painting.viewer.saveFailed') });
    }
  }, [alert, currentOutput, t, toast]);

  const showOpenSettingsAlert = useCallback(() => {
    alert.confirm({
      confirmLabel: t('settings.permissions.openSystemSettings'),
      description: t('painting.viewer.savePermissionDenied'),
      onConfirm: () =>
        Linking.openSettings().catch(() => {
          alert.show({ title: t('painting.viewer.savePermissionDenied') });
        }),
      title: t('settings.permissions.accessRequired'),
    });
  }, [alert, t]);

  const requestPhotoAccessAndSave = useCallback(async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await saveToPhotos();
      } else if (!permission.canAskAgain) {
        showOpenSettingsAlert();
      }
    } catch {
      alert.show({ title: t('painting.viewer.saveFailed') });
    }
  }, [alert, saveToPhotos, showOpenSettingsAlert, t]);

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
      alert.show({ title: t('painting.viewer.saveFailed') });
    }
  }, [alert, requestPhotoAccessAndSave, saveToPhotos, showOpenSettingsAlert, t]);

  const remove = useCallback(() => {
    const deletion = deletePaintings([painting.id]);
    router.back();
    void deletion.catch(() => {
      alert.show({ title: t('painting.viewer.deleteFailed') });
    });
  }, [alert, deletePaintings, painting.id, router, t]);

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
      pathname: '/paintings',
    });
  }, [painting.id, router]);

  return { download, edit, remove, resize, viewConversation };
}
