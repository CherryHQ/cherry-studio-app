import { Button, ContentState, type MenuItem, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';
import type { FileEntryKind } from '@/frontend/components/FileEntryPreview';
import { queryKeys } from '@/frontend/data';
import { readFileText } from '@/frontend/utils/readFileText';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useAddFileToChat } from '../hooks/useAddFileToChat';
import { FileHtmlBody } from './FileHtmlBody';
import { FileTextBody } from './FileTextBody';
import { FileViewerFooter } from './FileViewerFooter';
import { FileViewerHeader } from './FileViewerHeader';

const logger = loggerService.withContext('FileViewer');

export function FileTextViewer({
  file,
  kind,
  sourceChat,
}: {
  file: ResolvedFile;
  kind: FileEntryKind;
  sourceChat?: ChatTarget;
}) {
  const addToChat = useAddFileToChat(file, sourceChat);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSourceVisible, setIsSourceVisible] = useState(false);
  const [hasHtmlFailed, setHasHtmlFailed] = useState(false);
  const textQuery = useQuery({
    gcTime: 60_000,
    networkMode: 'always',
    queryFn: () => {
      try {
        return readFileText(file.uri);
      } catch (error) {
        logger.warn('File text read failed', error as Error, { entryId: file.entry.id });
        throw error;
      }
    },
    queryKey: queryKeys.files.viewerText(file.entry, file.uri),
    retry: false,
    staleTime: Infinity,
  });
  const content = textQuery.data;
  const isHtml = kind === 'html';
  const isPlainText = file.entry.mediaType.split(';')[0].trim().toLowerCase() === 'text/plain';
  const showHtml = isHtml && !isSourceVisible && !hasHtmlFailed && !content?.isTruncated;
  const items: MenuItem[] = [];

  if (content) {
    items.push({
      id: 'copy',
      label: t(content.isTruncated ? 'fileViewer.copyVisibleText' : 'fileViewer.copyText'),
      onPress: () => {
        void Clipboard.setStringAsync(content.text).then(
          () => toast.show({ label: t('fileViewer.copied'), variant: 'success' }),
          () => toast.show({ label: t('fileViewer.copyFailed'), variant: 'danger' }),
        );
      },
    });
    if (isHtml && !content.isTruncated) {
      items.push({
        id: 'html-source',
        label: t(showHtml ? 'fileViewer.showSource' : 'fileViewer.showPage'),
        onPress: () => {
          setIsSourceVisible(showHtml);
          setHasHtmlFailed(false);
        },
      });
    }
  }

  return (
    <>
      <FileViewerHeader file={file} items={items} />
      <View className="flex-1 overflow-hidden">
        <View className="flex-1 bg-background">
          {textQuery.isPending ? (
            <View className="flex-1 items-center justify-center p-6">
              <ContentState.Loading title={t('fileViewer.loading')} />
            </View>
          ) : !content ? (
            <View className="flex-1 items-center justify-center p-6">
              <ContentState.Error
                description={t('fileViewer.readFailedDescription')}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => void textQuery.refetch(),
                }}
                title={t('fileViewer.readFailed')}
              />
            </View>
          ) : (
            <>
              {content.isTruncated || hasHtmlFailed ? (
                <View className="px-4 py-3">
                  <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
                    {t(content.isTruncated ? 'fileViewer.truncated' : 'fileViewer.htmlFailed')}
                  </Text>
                </View>
              ) : null}
              {content.text.length === 0 ? (
                <View className="flex-1 items-center justify-center p-6">
                  <ContentState.Empty title={t('fileViewer.empty')} />
                </View>
              ) : showHtml ? (
                <View className={addToChat.returnsToSourceChat ? 'flex-1' : 'flex-1 pb-safe'}>
                  <FileHtmlBody html={content.text} onFailure={() => setHasHtmlFailed(true)} />
                </View>
              ) : (
                <FileTextBody
                  bottomInset={addToChat.returnsToSourceChat ? 0 : undefined}
                  text={content.text}
                  variant={
                    kind === 'markdown' && !content.isTruncated
                      ? 'markdown'
                      : isPlainText
                        ? 'text'
                        : 'source'
                  }
                />
              )}
            </>
          )}
        </View>
      </View>
      {content && addToChat.returnsToSourceChat ? (
        <FileViewerFooter>
          <Button disabled={addToChat.isResolving} onPress={addToChat.add}>
            {t('fileViewer.addToChat')}
          </Button>
        </FileViewerFooter>
      ) : null}
    </>
  );
}
