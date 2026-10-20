import type { FilePreviewSelection } from '@cherrystudio/file-preview-webview/protocol';
import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatHref, createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { createReadyAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import { canPreviewDocument, useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { useAgentsApi } from '@/frontend/hooks/agent';
import type { ResolvedFile } from '@/shared/contracts/file';
import {
  documentFileTypeFromMediaType,
  isBuiltinOfficeFileType,
} from '@/shared/utils/documentFileTypes';

import { useDocumentPreviewPage } from '../hooks/useDocumentPreviewPage';
import { officeSelectionReference } from '../utils/officeSelection';
import { FileDocumentPreview } from './FileDocumentPreview';
import { FileMenuGuide } from './FileMenuGuide';
import { FileViewerHeader } from './FileViewerHeader';

export function FileDocumentViewer({ file }: { file: ResolvedFile }) {
  const { t } = useTranslation();
  const { openFileEntryWithSystem } = useOpenFileEntry();
  const page = useDocumentPreviewPage();
  const [status, setStatus] = useState<'preview' | 'failed' | 'system' | 'tooLarge'>(() =>
    canPreviewDocument(file.entry) ? 'preview' : 'system',
  );
  const [attempt, setAttempt] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<FilePreviewSelection | null>(null);
  const router = useRouter();
  const { agents } = useAgentsApi();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const documentType = documentFileTypeFromMediaType(file.entry.mediaType);
  const canSelect =
    status === 'preview' &&
    !page.isError &&
    Boolean(page.data) &&
    file.entry.size <= 4 * 1024 * 1024 &&
    documentType !== undefined &&
    isBuiltinOfficeFileType(documentType);
  const toggleSelection = () => {
    setSelection(null);
    setIsSelecting((value) => !value);
  };
  const openSelection = () => {
    if (!selection) return;
    const reference = officeSelectionReference(file, selection, (slide) =>
      t('fileViewer.selection.slide', { slide }),
    );
    if (!reference) return;
    const agent = agents.find((agent) => agent.mode === 'standard');
    if (!agent) {
      toast.show({ label: t('fileViewer.selection.requiresAgent'), variant: 'danger' });
      return;
    }
    const composerHandoff = createChatComposerHandoff({
      attachments: [createReadyAttachmentDraft(file, `file-entry:${file.entry.id}`)],
      draft: '',
      selection: reference,
    });
    router.dismissTo(chatHref({ kind: 'draft', agentId: agent.id, composerHandoff }));
  };
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
          bottomInset={isSelecting ? 0 : undefined}
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
        <View
          className="gap-3 bg-background px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 16) }}
        >
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {selection?.excerpt ?? t('fileViewer.selection.hint')}
          </Text>
          <Button disabled={!selection} onPress={openSelection}>
            {t('fileViewer.selection.openChat')}
          </Button>
        </View>
      ) : null}
    </>
  );
}
