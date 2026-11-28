import { openFilePreview, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { prepareSharedFile, useExportWatermark } from '@/frontend/appShell/fileExport';
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
import { useLibraryMasterDetail } from '@/frontend/appShell/pane/state';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { FilePreviewSource, ResolvedFile } from '@/shared/contracts/file';
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

/** Whether the preview was opened from inside a conversation or an external browsing surface. */
export type FilePreviewOrigin = 'chat' | 'external';

export type OpenFileEntryOptions = {
  origin?: FilePreviewOrigin;
  replaceImage?: ReplacePreviewImage;
  sourceChat?: ChatTarget;
};

/** Shared by cards and the viewer's explicit system-open escape hatch. */
export function useOpenFileEntry(options: FileExportOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<ChatRouteParamsInput & { sourceChat?: string | string[] }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const requestImageEdit = useImagePreviewEditRequest();
  const masterDetail = useLibraryMasterDetail();

  const openFileEntryWithSystem = async ({ entry, uri }: FilePreviewSource) => {
    try {
      const exported = await prepareSharedFile({ entry, uri }, { watermark: createWatermark() });
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
    openOptions?: OpenFileEntryOptions,
  ): FileEntryOpenTarget => {
    const kind = fileEntryPreviewKind(file.entry);
    if (kind === 'audio' || (kind === 'document' && !canPreviewDocument(file.entry))) {
      void openFileEntryWithSystem(file);
      return 'system';
    }
    const imageEditRequestId =
      openOptions?.replaceImage && canEditFileImage(file.entry.mediaType)
        ? requestImageEdit(file.entry.id, openOptions.replaceImage)
        : undefined;
    // In wide Files Master-Detail, tapping an entry updates the live right preview pane.
    // Chat attachments and compact libraries always push the standalone file viewer route.
    if (masterDetail?.isMasterDetail) {
      masterDetail.selectFile(file.entry.id);
      return 'pane';
    }
    const origin: FilePreviewOrigin =
      openOptions?.origin ?? (pathname === '/' ? 'chat' : 'external');
    const sourceChat = resolveSourceChat(pathname, params, openOptions?.sourceChat);
    try {
      router.push({
        pathname: '/files/[fileEntryId]',
        params: {
          fileEntryId: file.entry.id,
          ...(imageEditRequestId ? { imageEditRequestId } : {}),
          ...(sourceChat ? { sourceChat: JSON.stringify(chatRouteParams(sourceChat)) } : {}),
          ...(sourceChat && origin === 'chat' ? { sourceOrigin: 'chat' } : {}),
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
  fallbackSourceChat?: ChatTarget,
): ChatTarget | undefined {
  if (pathname !== '/') {
    return parseChatPreviewSource(getSingleRouteParam(params.sourceChat)) ?? fallbackSourceChat;
  }
  const chat = parseChatRoute(params);
  return chat.status === 'ready' ? chat.target : undefined;
}
