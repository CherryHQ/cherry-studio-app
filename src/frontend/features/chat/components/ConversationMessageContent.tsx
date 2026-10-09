import {
  BottomSheet,
  Button,
  ContentState,
  FileAttachmentPreview,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import * as Sharing from 'expo-sharing';
import { useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ConversationMessage, ResourceRead } from '@/frontend/appShell/conversation';
import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { ToolRendererProvider } from '@/frontend/components/Message';
import { filenameExtension } from '@/shared/data/types/file';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import { getConversationToolTitle } from './conversationToolTitle';

export function ConversationMessageContent({
  children,
  messageState,
  tools,
}: PropsWithChildren<{
  messageState?: ConversationMessage['state'];
  tools?: ConversationMessage['tools'];
}>) {
  const { t } = useTranslation();
  // Remote rows always carry a list; wrapping only once a tool arrives would remount the message.
  if (!tools) return children;
  return (
    <ToolRendererProvider
      getToolTitle={(name) => getConversationToolTitle(name, t)}
      renderTool={(part) => {
        const tool = tools.find((item) => item.key === part.toolCallId);
        return tool ? (
          <MessagePart.Tool
            title={getConversationToolTitle(tool.title, t)}
            state={
              messageState === 'streaming' &&
              (tool.state === 'streaming' || tool.state === 'input-ready')
                ? 'running'
                : 'complete'
            }
            statusTone={tool.state === 'failed' ? 'danger' : 'default'}
          >
            {tool.output ? (
              <ConversationResourceSection resource={tool.output} title={t('chat.tool.output')} />
            ) : null}
            {tool.input ? (
              <ConversationResourceSection resource={tool.input} title={t('chat.tool.arguments')} />
            ) : null}
            {!tool.input && !tool.output ? (
              <Text className="text-sm text-muted-foreground">{t('chat.tool.noOutput')}</Text>
            ) : null}
          </MessagePart.Tool>
        ) : null;
      }}
    >
      {children}
    </ToolRendererProvider>
  );
}
function ConversationResourceSection({
  resource,
  title,
}: {
  resource: ResourceRead;
  title: string;
}) {
  const { t } = useTranslation();
  const result = useConversationResourceValue(resource);
  if (result.isError)
    return (
      <ContentState.Error
        title={t('remoteAgent.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: result.refetch }}
      />
    );
  if (!result.data) return <ContentState.Loading title={t('remoteAgent.loading')} />;
  const value =
    result.data.kind === 'text'
      ? result.data.text
      : result.data.kind === 'json'
        ? JSON.stringify(result.data.value, null, 2)
        : result.data.kind === 'metadata' || result.data.kind === 'file'
          ? result.data.name
          : JSON.stringify(
              result.data.kind === 'user-question' ? result.data.question : result.data.questions,
              null,
              2,
            );
  return <MessagePart.TextSection title={title} value={value} />;
}
export function ConversationAttachments({
  attachments,
}: {
  attachments: NonNullable<ConversationMessage['attachments']>;
}) {
  return (
    <View className="w-full gap-2">
      {attachments.map((item) => (
        <ConversationAttachment key={item.key} item={item} />
      ))}
    </View>
  );
}
function ConversationAttachment({
  item,
}: {
  item: NonNullable<ConversationMessage['attachments']>[number];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [opened, setOpened] = useState(false);
  const result = useConversationResourceValue(opened ? item.resource : undefined);
  const file = result.data?.kind === 'file' ? result.data : undefined;
  const share = async () => {
    if (!file) return;
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('UNAVAILABLE');
      await Sharing.shareAsync(file.uri, { dialogTitle: file.name, mimeType: file.mediaType });
    } catch {
      toast.show({ label: t('remoteAgent.loadFailed'), variant: 'danger' });
    }
  };
  return (
    <>
      <FileAttachmentPreview
        categoryLabel={t('filePreview.document')}
        disabled={!item.resource}
        file={{
          displayName: item.name,
          extensionLabel: filenameExtension(item.name)?.slice(0, 5).toUpperCase() ?? '',
        }}
        labels={{ openWith: t('filePreview.openWith'), unavailable: t('filePreview.unavailable') }}
        onPress={() => setOpened(true)}
      />
      {opened ? (
        <BottomSheet
          open
          onClose={() => setOpened(false)}
          title={item.name}
          size="large"
          footer={
            file ? (
              <Button onPress={() => void share()}>{t('filePreview.openWith')}</Button>
            ) : undefined
          }
        >
          {result.isError ? (
            <ContentState.Error
              title={t('remoteAgent.loadFailed')}
              primaryAction={{ children: t('common.retry'), onPress: result.refetch }}
            />
          ) : !result.data ? (
            <ContentState.Loading title={t('remoteAgent.loading')} />
          ) : file?.mediaType?.startsWith('image/') ? (
            <View className="h-96">
              <ArtifactImageViewer accessibilityLabel={file.name} uri={file.uri} />
            </View>
          ) : (
            <Text className="p-4 text-foreground">
              {file?.name ?? t('filePreview.unavailable')}
            </Text>
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
