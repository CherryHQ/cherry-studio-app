import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { Button } from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useShareFile } from '@/frontend/appShell/sharing';

import type { FileViewerSource } from '../fileViewerSource';
import type {
  FileViewerFooterActionId,
  FileViewerFooterActions,
} from '../utils/fileViewerFooterActions';
import { FileViewerFooter } from './FileViewerFooter';

export type FileViewerActionFooterProps = {
  file: FileViewerSource;
  actions: FileViewerFooterActions;
  onAddToChat: () => void;
  isResolvingAddToChat: boolean;
  onSaveToPhotos?: () => void | Promise<void>;
};

/** Shared bottom action bar for resolved files, composing at most two footer buttons. */
export function FileViewerActionFooter({
  file,
  actions,
  onAddToChat,
  isResolvingAddToChat,
  onSaveToPhotos,
}: FileViewerActionFooterProps) {
  const { t } = useTranslation();
  const canShare = file.kind === 'managed';
  const { isSharing, share } = useShareFile(canShare ? file : undefined);

  if (!actions.hasActions) return null;

  const context: FooterButtonContext = {
    canShare,
    isResolvingAddToChat,
    isSharing,
    onAddToChat,
    onSaveToPhotos,
    share,
    t,
  };

  const secondaryButton = renderFooterButton(actions.secondary, 'tonal', context);
  const primaryButton = renderFooterButton(actions.primary, 'default', context);

  if (!secondaryButton && !primaryButton) return null;

  return (
    <FileViewerFooter>
      <View className="flex-row items-center gap-3">
        {secondaryButton ? <View className="min-w-0 flex-1">{secondaryButton}</View> : null}
        {primaryButton ? <View className="min-w-0 flex-1">{primaryButton}</View> : null}
      </View>
    </FileViewerFooter>
  );
}

type FooterButtonContext = {
  canShare: boolean;
  isResolvingAddToChat: boolean;
  isSharing: boolean;
  onAddToChat: () => void;
  onSaveToPhotos?: () => void | Promise<void>;
  share: () => Promise<void>;
  t: TFunction;
};

function renderFooterButton(
  actionId: FileViewerFooterActionId | undefined,
  variant: 'default' | 'tonal',
  {
    canShare,
    isResolvingAddToChat,
    isSharing,
    onAddToChat,
    onSaveToPhotos,
    share,
    t,
  }: FooterButtonContext,
) {
  switch (actionId) {
    case 'addToChat':
      return (
        <Button
          disabled={isResolvingAddToChat}
          onPress={onAddToChat}
          size="footer"
          testID="file-viewer-footer-add-to-chat"
          variant={variant}
        >
          {t('fileViewer.addToChat')}
        </Button>
      );
    case 'share':
      if (!canShare) return null;
      return (
        <Button
          disabled={isSharing}
          loading={isSharing}
          onPress={() => void share()}
          size="footer"
          testID="file-viewer-footer-share"
          variant={variant}
        >
          {t('fileViewer.share')}
        </Button>
      );
    case 'saveToPhotos':
      if (!onSaveToPhotos) return null;
      return (
        <Button
          icon={<DownloadIcon />}
          onPress={() => void onSaveToPhotos()}
          size="footer"
          testID="file-viewer-footer-save-to-photos"
          variant={variant}
        >
          {t('sharing.saveToPhotos')}
        </Button>
      );
    default:
      return null;
  }
}
