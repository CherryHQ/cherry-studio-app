import {
  BottomSheet,
  ContentState,
  FilePreview,
  MessagePart,
  useToast,
} from '@cherrystudio/ui/components';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConversationMessage, ResourceValue } from '@/frontend/appShell/conversation';
import {
  openTemporaryFilePreview,
  prepareTemporaryFilePreview,
} from '@/frontend/appShell/filePreview';
import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview';
import {
  MessageFileRendererProvider,
  ReadOnlyToolContent,
  ToolRendererProvider,
} from '@/frontend/components/Message';
import { filenameExtension } from '@/shared/data/types/file';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import { getConversationToolTitle } from './conversationToolTitle';

export function ConversationMessageContent({
  children,
  messageState,
  tools,
  attachments,
}: PropsWithChildren<{
  messageState?: ConversationMessage['state'];
  tools?: ConversationMessage['tools'];
  attachments?: ConversationMessage['attachments'];
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
      <MessageFileRendererProvider
        renderFile={(key) => {
          const item = attachments?.find((item) => item.key === key);
          return item ? <ConversationAttachment item={item} presentation="result" /> : null;
        }}
      >
        {children}
      </MessageFileRendererProvider>
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
  presentation = 'attachment',
}: {
  presentation?: 'attachment' | 'result';
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
  useEffect(() => {
    if (!opened || !file) return;
    const controller = new AbortController();
    void prepareTemporaryFilePreview(
      { uri: file.uri, filename: file.name, mediaType: file.mediaType },
      controller.signal,
    )
      .then((preview) => {
        if (controller.signal.aborted) {
          preview.release();
          return;
        }
        // The viewer retains its own bytes; closing the download sheet may release the source read.
        openTemporaryFilePreview(preview);
        setOpened(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          toast.show({ label: t('remoteAgent.loadFailed'), variant: 'danger' });
          setOpened(false);
        }
      });
    return () => controller.abort();
  }, [file, opened, t, toast]);
  return (
    <>
      <FilePreview
        variant={presentation === 'result' && kind === 'image' ? 'card' : 'attachment'}
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
        <BottomSheet open onClose={() => setOpened(false)} title={item.name} size="large">
          {result.isError || (result.isSuccess && !file) ? (
            <ContentState.Error
              title={t(result.isError ? 'remoteAgent.loadFailed' : 'filePreview.unavailable')}
              primaryAction={
                result.isError
                  ? { children: t('common.retry'), onPress: result.refetch }
                  : undefined
              }
            />
          ) : (
            <ContentState.Loading title={t('remoteAgent.loading')} />
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
