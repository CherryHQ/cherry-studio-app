import { ContentState } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { canPreviewDocument, useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useDocumentPreviewPage } from '../hooks/useDocumentPreviewPage';
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
  const openWithSystem = () => void openFileEntryWithSystem(file);
  const openWithAction = { children: t('filePreview.openWith'), onPress: openWithSystem };

  return (
    <>
      <FileViewerHeader file={file} />
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
          file={file}
          key={attempt}
          // The app, not the package, offers system opening for documents it cannot preview.
          onDocumentError={(code) => setStatus(code === 'too_large' ? 'tooLarge' : 'failed')}
          onFailure={() => setStatus('failed')}
          onTooLarge={() => setStatus('tooLarge')}
          onUnsupported={() => setStatus('system')}
          page={page.data}
        />
      )}
    </>
  );
}
