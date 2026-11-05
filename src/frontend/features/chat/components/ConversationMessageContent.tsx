import {
  BottomSheet,
  Button,
  ContentState,
  FilePreview,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import * as Sharing from 'expo-sharing';
import { useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ConversationMessage, ResourceRead } from '@/frontend/appShell/conversation';
import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview';
import { ToolRendererProvider } from '@/frontend/components/Message';
import { MessageDetailText } from '@/frontend/components/MessageDetail';
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
        if (!tool) return null;
        const isReportArtifacts =
          tool.title === 'report_artifacts' ||
          part.toolCallId.includes('report_artifacts') ||
          tool.key.includes('report_artifacts');
        return (
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
            {isReportArtifacts && tool.input ? (
              <ReportArtifactsDeliverables input={tool.input} />
            ) : null}
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
        );
      }}
    >
      {children}
    </ToolRendererProvider>
  );
}

function ReportArtifactsDeliverables({ input }: { input: ResourceRead }) {
  const { t } = useTranslation();
  const inputResult = useConversationResourceValue(input);
  const artifacts = useMemo(() => {
    if (!inputResult.data) return [];
    try {
      const parsed =
        inputResult.data.kind === 'json'
          ? inputResult.data.value
          : inputResult.data.kind === 'text'
            ? JSON.parse(inputResult.data.text)
            : null;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).artifacts)) {
        return (parsed as any).artifacts as Array<{ path: string; description?: string }>;
      }
    } catch {
      return [];
    }
    return [];
  }, [inputResult.data]);

  if (!artifacts.length) return null;

  return (
    <View className="my-2 gap-2" testID="deliverables-section">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('chat.deliverables.title', 'Session Deliverables')}
      </Text>
      {artifacts.map((artifact, index) => {
        const filename = artifact.path.split(/[/\\]/).pop() || artifact.path;
        return (
          <View
            key={`${artifact.path}-${index}`}
            testID="deliverable-card"
            className="gap-1 rounded-lg border border-border bg-card p-3"
          >
            <Text
              testID="deliverable-filename"
              className="font-medium text-foreground"
              numberOfLines={1}
            >
              {filename}
            </Text>
            {artifact.description ? (
              <Text
                testID="deliverable-description"
                className="text-xs text-muted-foreground"
                numberOfLines={2}
              >
                {artifact.description}
              </Text>
            ) : null}
            <Text className="font-mono text-xs text-muted-foreground" numberOfLines={1}>
              {artifact.path}
            </Text>
          </View>
        );
      })}
    </View>
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
  return (
    <MessageDetailText
      title={title}
      value={value}
      language="json"
      variant={
        result.data.kind === 'json' ||
        result.data.kind === 'user-question' ||
        result.data.kind === 'question'
          ? 'code'
          : 'body'
      }
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
  const byteLength = item.byteLength ? Number(item.byteLength) : undefined;
  const isLarge = byteLength !== undefined && byteLength > 1_048_576;
  const shouldAutoDownload = kind === 'image' && !isLarge;
  const result = useConversationResourceValue(
    opened || shouldAutoDownload ? item.resource : undefined,
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
