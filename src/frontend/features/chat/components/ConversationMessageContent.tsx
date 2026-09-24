import { ContentState, FileAttachmentPreview, MessagePart } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ConversationMessage, ResourceRead } from '@/frontend/appShell/conversation';
import { ToolRendererProvider } from '@/frontend/components/Message';
import { filenameExtension } from '@/shared/data/types/file';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import { getConversationToolTitle } from './conversationToolTitle';

export function ConversationMessageContent({
  message,
  children,
}: PropsWithChildren<{ message: ConversationMessage }>) {
  const { t } = useTranslation();
  if (!message.tools?.length) return children;
  return (
    <ToolRendererProvider
      getToolTitle={(name) => getConversationToolTitle(name, t)}
      renderTool={(part) => {
        const tool = message.tools?.find((item) => item.key === part.toolCallId);
        return tool ? (
          <MessagePart.Tool
            title={getConversationToolTitle(tool.title, t)}
            state={
              message.state === 'streaming' &&
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
        : result.data.kind === 'metadata'
          ? result.data.name
          : JSON.stringify(
              result.data.kind === 'user-question' ? result.data.question : result.data.questions,
              null,
              2,
            );
  return <MessagePart.TextSection title={title} value={value} />;
}
export function ConversationAttachments({ message }: { message: ConversationMessage }) {
  const { t } = useTranslation();
  return (
    <View className="w-full gap-2">
      {message.attachments?.map((item) => (
        <FileAttachmentPreview
          key={item.key}
          categoryLabel={t('filePreview.document')}
          disabled
          file={{
            displayName: item.name,
            extensionLabel: filenameExtension(item.name)?.slice(0, 5).toUpperCase() ?? '',
          }}
          labels={{
            openWith: t('filePreview.openWith'),
            unavailable: t('filePreview.unavailable'),
          }}
          onPress={() => {}}
        />
      ))}
    </View>
  );
}
