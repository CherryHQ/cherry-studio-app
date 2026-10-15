import ArrowLeftRightIcon from '@cherrystudio/app-icons/icons/arrow-left-right';
import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import { BackgroundPressExclusion, Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSaveImageToPhotos } from '@/frontend/appShell/fileExport';
import { useComposerActions, useComposerPresentationActions } from '@/frontend/components/Composer';
import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { usePaintingReferenceSelection } from '@/frontend/components/PaintingInput';

import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';

export function PaintingResultActions({
  output,
  onEdit,
  onCompare,
}: {
  output: { fileEntryId: string; uri: string };
  onEdit?: (output: { fileEntryId: string; uri: string }) => void;
  onCompare?: (output: { fileEntryId: string; uri: string }) => void;
}) {
  const { t } = useTranslation();
  const file = useResolvedFile(output.fileEntryId);
  const reference = usePaintingReferenceSelection();
  const { dismissInput } = useComposerPresentationActions();
  const { setAttachments } = useComposerActions();
  const save = useSaveImageToPhotos({ uri: output.uri, provenance: file.data?.entry.provenance });
  return (
    <BackgroundPressExclusion>
      <View className="flex-row items-center justify-between gap-3">
        {onEdit ? (
          <Button
            onPress={() => {
              dismissInput();
              setAttachments([createPaintingOutputAttachmentDraft(output)]);
              reference.clear();
              onEdit(output);
            }}
            size="sm"
            variant="ghost"
          >
            <PencilIcon className="size-4 text-muted-foreground" />
            <Button.Label>{t('painting.viewer.edit')}</Button.Label>
          </Button>
        ) : null}
        {onCompare ? (
          <Button
            onPress={() => {
              dismissInput();
              onCompare(output);
            }}
            size="sm"
            variant="ghost"
          >
            <ArrowLeftRightIcon className="size-4 text-muted-foreground" />
            <Button.Label>{t('painting.workspace.compare')}</Button.Label>
          </Button>
        ) : null}
        <Button onPress={() => void save()} size="sm" variant="ghost">
          <DownloadIcon className="size-4 text-muted-foreground" />
          <Button.Label>{t('common.save')}</Button.Label>
        </Button>
      </View>
    </BackgroundPressExclusion>
  );
}
