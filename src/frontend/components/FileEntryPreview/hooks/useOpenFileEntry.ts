import { openFilePreview, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { prepareFileExport, useExportWatermark } from '@/frontend/appShell/fileExport';
import {
  finishImagePreviewEditRequest,
  useImagePreviewEditRequest,
  type ReplacePreviewImage,
} from '@/frontend/appShell/imagePreview';
import {
  chatRouteParams,
  parseChatPreviewSource,
  parseChatRoute,
  type ChatRouteParamsInput,
  type ChatTarget,
} from '@/frontend/appShell/navigation/chat';
import { useFilePane } from '@/frontend/appShell/pane/state';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import { canEditFileImage } from '@/shared/contracts/fileImageEdit';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  canPreviewDocument,
  fileEntryPreviewKind,
  toFilePreviewFile,
} from '../utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Where a file opened: beside chat, on its own page, or in another app. */
export type FileEntryOpenTarget = 'pane' | 'route' | 'system';

/** Shared by cards and the viewer's explicit system-open escape hatch. */
export function useOpenFileEntry(options: FileExportOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<ChatRouteParamsInput & { sourceChat?: string | string[] }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const requestImageEdit = useImagePreviewEditRequest();
  const pane = useFilePane();

  const openFileEntryWithSystem = async ({ entry, uri }: ResolvedFile) => {
    try {
      const exported = await prepareFileExport({ entry, uri }, createWatermark());
      // The recipient may read after the chooser closes; the OS owns this cache copy's lifetime.
      await openFilePreview({
        file: toFilePreviewFile(
          { ...entry, filename: exported.filename, mediaType: exported.mediaType },
          exported.uri,
        ),
        labels: {
          openWith: t('filePreview.openWith'),
          unavailable: t('filePreview.unavailable'),
        },
      });
    } catch (error) {
      logger.warn('File preview operation failed', error as Error, {
        entryId: entry.id,
        operation: 'open',
      });
      toast.show({ label: t('filePreview.openFailed'), variant: 'danger' });
    }
  };

  const openFileEntry = (
    file: ResolvedFile,
    replaceImage?: ReplacePreviewImage,
  ): FileEntryOpenTarget => {
    const kind = fileEntryPreviewKind(file.entry);
    if (kind === 'audio' || (kind === 'document' && !canPreviewDocument(file.entry))) {
      void openFileEntryWithSystem(file);
      return 'system';
    }
    const imageEditRequestId =
      replaceImage && canEditFileImage(file.entry.mediaType)
        ? requestImageEdit(file.entry.id, replaceImage)
        : undefined;
    // Beside chat, a file opens in the pane instead of covering the conversation. Pages above the
    // chat share its drawer but not its pane, so they keep opening files on their own page.
    if (pane?.isAvailable && pathname === '/') {
      pane.openFile({ entryId: file.entry.id, imageEditRequestId });
      return 'pane';
    }
    const sourceChat = resolveSourceChat(pathname, params);
    try {
      router.push({
        pathname: '/files/[fileEntryId]',
        params: {
          fileEntryId: file.entry.id,
          ...(imageEditRequestId ? { imageEditRequestId } : {}),
          ...(sourceChat ? { sourceChat: JSON.stringify(chatRouteParams(sourceChat)) } : {}),
        },
      });
    } catch (error) {
      if (imageEditRequestId) finishImagePreviewEditRequest(imageEditRequestId);
      throw error;
    }
    return 'route';
  };

  return { openFileEntry, openFileEntryWithSystem };
}

/** The chat a preview returns to: the chat page itself, or the chat a library page came from. */
function resolveSourceChat(
  pathname: string,
  params: ChatRouteParamsInput & { sourceChat?: string | string[] },
): ChatTarget | undefined {
  if (pathname !== '/') return parseChatPreviewSource(getSingleRouteParam(params.sourceChat));
  const chat = parseChatRoute(params);
  return chat.status === 'ready' ? chat.target : undefined;
}
