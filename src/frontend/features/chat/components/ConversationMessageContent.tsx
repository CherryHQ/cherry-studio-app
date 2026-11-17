import {
  BottomSheet,
  Button,
  ContentState,
  FilePreview,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import * as Sharing from 'expo-sharing';
import { useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ConversationMessage, ResourceValue } from '@/frontend/appShell/conversation';
import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview';
import { ReadOnlyToolContent, ToolRendererProvider } from '@/frontend/components/Message';
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
            <ConversationToolDetail tool={tool} />
          </MessagePart.Tool>
        ) : null;
      }}
    >
      {children}
    </ToolRendererProvider>
  );
}
function toolValue(value: ResourceValue | undefined): unknown {
  if (value?.kind === 'json') return value.value;
  if (value?.kind !== 'text') return undefined;
  try {
    return JSON.parse(value.text);
  } catch {
    return value.text;
  }
}

function ConversationToolDetail({
  tool,
}: {
  tool: NonNullable<ConversationMessage['tools']>[number];
}) {
  const { t } = useTranslation();
  const input = useConversationResourceValue(tool.input);
  const output = useConversationResourceValue(tool.output);
  if (input.isError || output.isError)
    return (
      <ContentState.Error
        title={t('remoteAgent.loadFailed')}
        primaryAction={{
          children: t('common.retry'),
          onPress: () => {
            if (input.isError) input.refetch();
            if (output.isError) output.refetch();
          },
        }}
      />
    );
  if (input.isPending || output.isPending)
    return <ContentState.Loading title={t('remoteAgent.loading')} />;
  return (
    <ReadOnlyToolContent
      name={tool.title}
      input={toolValue(input.data)}
      output={toolValue(output.data)}
      failed={tool.state === 'failed'}
    />
  );
}
export function ConversationAttachments({
  attachments,
}: {
  attachments: NonNullable<ConversationMessage['attachments']>;
}) {
  return (
    <>
      {attachments.map((item) => (
        <ConversationAttachment key={item.key} item={item} />
      ))}
    </>
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
  const kind = fileEntryPreviewKind({ mediaType: item.mediaType ?? 'application/octet-stream' });
  const result = useConversationResourceValue(
    opened || kind === 'image' ? item.resource : undefined,
  );
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
      <FilePreview
        variant="attachment"
        metadata={{
          kind,
          displayName: item.name,
          extensionLabel: filenameExtension(item.name)?.slice(0, 5).toUpperCase() ?? '',
        }}
        file={
          file
            ? {
                id: item.key,
                revision: file.uri,
                uri: file.uri,
                kind: fileEntryPreviewKind({
                  mediaType: file.mediaType ?? 'application/octet-stream',
                }),
                displayName: file.name,
                extensionLabel: filenameExtension(file.name)?.slice(0, 5).toUpperCase() ?? '',
              }
            : undefined
        }
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
