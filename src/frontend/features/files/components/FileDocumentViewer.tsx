import type { FilePreviewSelection } from '@cherrystudio/file-preview-webview/protocol';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  createChatComposerHandoff,
  createChatSelectionHandoff,
  type ChatTarget,
} from '@/frontend/appShell/navigation/chat';
import { AgentMenu } from '@/frontend/components/AgentMenu';
import { createReadyAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import { canPreviewDocument, useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { Agent } from '@/shared/data/types/agent';
import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';

import { useAddFileToChat } from '../hooks/useAddFileToChat';
import { useDocumentPreviewPage } from '../hooks/useDocumentPreviewPage';
import { useReturnToChat } from '../hooks/useReturnToChat';
import { acceptsSelection } from '../hooks/useSelectionSourceChat';
import { officeSelectionReference } from '../utils/officeSelection';
import { FileDocumentPreview } from './FileDocumentPreview';
import { FileMenuGuide } from './FileMenuGuide';
import { FileViewerFooter } from './FileViewerFooter';
import { FileViewerHeader } from './FileViewerHeader';

export function FileDocumentViewer({
  file,
  sourceChat,
}: {
  file: ResolvedFile;
  sourceChat?: ChatTarget;
}) {
  const { t } = useTranslation();
  const { openFileEntryWithSystem } = useOpenFileEntry();
  const page = useDocumentPreviewPage();
  const [status, setStatus] = useState<'preview' | 'failed' | 'system' | 'tooLarge'>(() =>
    canPreviewDocument(file.entry) ? 'preview' : 'system',
  );
  const [attempt, setAttempt] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<FilePreviewSelection | null>(null);
  const returnToChat = useReturnToChat();
  const addToChat = useAddFileToChat(file, sourceChat);
  const { isResolving: isResolvingSourceChat, returnsToSourceChat } = addToChat;
  const documentType = documentFileTypeFromMediaType(file.entry.mediaType);
  const isPreviewing = status === 'preview' && !page.isError && Boolean(page.data);
  const canSelect =
    isPreviewing && documentType !== undefined && isBuiltinOfficeFileType(documentType);
  const toggleSelection = () => {
    setSelection(null);
    setIsSelecting((value) => !value);
  };
  const createSelectionHandoff = () => {
    if (!selection) return;
    const reference = officeSelectionReference(file, selection, (slide) =>
      t('fileViewer.selection.slide', { slide }),
    );
    if (!reference) return;
    return {
      attachment: createReadyAttachmentDraft(file, `file-entry:${file.entry.id}`),
      selection: reference,
    };
  };
  const referenceInSourceChat = () => {
    const handoff = createSelectionHandoff();
    if (!handoff || !sourceChat) return;
    returnToChat({ ...sourceChat, selectionHandoff: createChatSelectionHandoff(handoff) });
  };
  const referenceInNewChat = (agent: Agent) => {
    const handoff = createSelectionHandoff();
    if (!handoff) return;
    const composerHandoff = createChatComposerHandoff({
      attachments: [handoff.attachment],
      draft: '',
      selection: handoff.selection,
    });
    returnToChat({ kind: 'draft', agentId: agent.id, composerHandoff });
  };
  const hasAddFooter = isPreviewing && returnsToSourceChat;
  const openWithSystem = () => void openFileEntryWithSystem(file);
  const openWithAction = { children: t('filePreview.openWith'), onPress: openWithSystem };

  return (
    <>
      <FileViewerHeader
        file={file}
        items={
          canSelect
            ? [
                {
                  id: 'select',
                  label: t(isSelecting ? 'common.cancel' : 'fileViewer.selection.select'),
                  onPress: toggleSelection,
                },
              ]
            : undefined
        }
      />
      {status === 'tooLarge' ? (
        // System opening stays in the header's overflow menu; this state points there.
        <FileMenuGuide
          hint={t('fileViewer.openWithMenuHint')}
          title={t('fileViewer.tooLargeToPreview')}
        />
      ) : status === 'system' ? (
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Empty
            primaryAction={openWithAction}
            title={t('fileViewer.systemPreview')}
          />
        </View>
      ) : status === 'failed' || page.isError ? (
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Error
            description={t('fileViewer.readFailedDescription')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => {
                if (page.isError) void page.refetch();
                setAttempt((value) => value + 1);
                setSelection(null);
                setIsSelecting(false);
                setStatus('preview');
              },
            }}
            title={t('fileViewer.previewFailed')}
          />
        </View>
      ) : !page.data ? (
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Loading title={t('fileViewer.loading')} />
        </View>
      ) : (
        <FileDocumentPreview
          bottomInset={(isSelecting && canSelect) || hasAddFooter ? 0 : undefined}
          file={file}
          key={attempt}
          // The app, not the package, offers system opening for documents it cannot preview.
          onDocumentError={(code) => setStatus(code === 'too_large' ? 'tooLarge' : 'failed')}
          onFailure={() => setStatus('failed')}
          onTooLarge={() => setStatus('tooLarge')}
          onUnsupported={() => setStatus('system')}
          onSelection={isSelecting && canSelect ? setSelection : undefined}
          page={page.data}
        />
      )}
      {isSelecting && canSelect ? (
        <FileViewerFooter>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {selection?.excerpt ?? t('fileViewer.selection.hint')}
          </Text>
          {returnsToSourceChat ? (
            <Button disabled={!selection || isResolvingSourceChat} onPress={referenceInSourceChat}>
              {t('fileViewer.selection.referenceInChat')}
            </Button>
          ) : (
            <AgentMenu accepts={acceptsSelection} onSelect={referenceInNewChat}>
              <Button disabled={!selection}>{t('fileViewer.selection.openChat')}</Button>
            </AgentMenu>
          )}
        </FileViewerFooter>
      ) : hasAddFooter ? (
        <FileViewerFooter>
          <Button disabled={isResolvingSourceChat} onPress={addToChat.add}>
            {t('fileViewer.addToChat')}
          </Button>
        </FileViewerFooter>
      ) : null}
    </>
  );
}
