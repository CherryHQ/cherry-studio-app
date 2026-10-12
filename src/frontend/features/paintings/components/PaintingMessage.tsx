import { BackgroundPressExclusion } from '@cherrystudio/ui/components';
import { memo, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ArtifactPreviewLink } from '@/frontend/components/ArtifactPreview';
import { PreviewImage, useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { type MessageListItem } from '@/frontend/components/Message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { PaintingAssistantMessage } from './PaintingAssistantMessage';

type AssistantProps = ComponentProps<typeof PaintingAssistantMessage>;
export type PaintingMessageState = Omit<
  AssistantProps,
  'onRetry' | 'onEditOutput' | 'onCompareOutput'
>;

type PaintingMessageProps = {
  message: MessageListItem;
  state: PaintingMessageState;
  archived?: boolean;
  versionNumber?: number;
  onRetry?: AssistantProps['onRetry'];
  onEditOutput?: AssistantProps['onEditOutput'];
  onCompareOutput?: AssistantProps['onCompareOutput'];
};

export const PaintingMessage = memo(function PaintingMessage({
  message,
  state,
  archived = false,
  versionNumber,
  onRetry,
  onEditOutput,
  onCompareOutput,
}: PaintingMessageProps) {
  const { t } = useTranslation();
  if (message.role === 'user') {
    const parts = message.data.parts ?? [];
    const prompt = parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
    const referenceIds = parts.flatMap((part) => {
      const id = part.type === 'file' ? readCherryMeta(part)?.fileEntryId : undefined;
      return id ? [id] : [];
    });
    return (
      <View className="w-full gap-2">
        <Text className="font-medium text-muted-foreground text-xs">
          {t('painting.workspace.version', { number: versionNumber ?? 1 })}
        </Text>
        {prompt ? (
          <BackgroundPressExclusion>
            <Text selectable className="text-foreground text-sm">
              {prompt}
            </Text>
          </BackgroundPressExclusion>
        ) : null}
        {referenceIds.length > 0 ? (
          <ScrollView
            horizontal
            contentContainerClassName="gap-2"
            showsHorizontalScrollIndicator={false}
          >
            {referenceIds.map((id) => (
              <PaintingPromptReference key={id} fileEntryId={id} />
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  }
  if (archived) {
    return (
      <ScrollView
        horizontal
        contentContainerClassName="gap-2"
        showsHorizontalScrollIndicator={false}
      >
        {state.outputs.map((output) => (
          <BackgroundPressExclusion key={output.fileEntryId}>
            {state.paintingId ? (
              <ArtifactPreviewLink
                href={{
                  pathname: '/paintings/[paintingId]',
                  params: { paintingId: state.paintingId, fileEntryId: output.fileEntryId },
                }}
              >
                <Pressable
                  accessibilityLabel={state.prompt}
                  accessibilityRole="button"
                  className="size-20 overflow-hidden rounded-xl bg-secondary active:opacity-80"
                >
                  <PreviewImage
                    label={state.prompt}
                    source={output.uri}
                    contentFit="cover"
                    style={{ height: '100%', width: '100%' }}
                  />
                </Pressable>
              </ArtifactPreviewLink>
            ) : (
              <View className="size-20 overflow-hidden rounded-xl bg-secondary">
                <PreviewImage
                  label={state.prompt}
                  source={output.uri}
                  contentFit="cover"
                  style={{ height: '100%', width: '100%' }}
                />
              </View>
            )}
          </BackgroundPressExclusion>
        ))}
      </ScrollView>
    );
  }
  return (
    <PaintingAssistantMessage
      {...state}
      onRetry={onRetry}
      onEditOutput={onEditOutput}
      onCompareOutput={onCompareOutput}
    />
  );
});

function PaintingPromptReference({ fileEntryId }: { fileEntryId: string }) {
  const file = useResolvedFile(fileEntryId);
  if (!file.data) return null;
  return (
    <View className="size-8 overflow-hidden rounded-sm bg-secondary">
      <PreviewImage
        label={file.data.entry.filename}
        source={file.data.uri}
        contentFit="cover"
        style={{ height: '100%', width: '100%' }}
      />
    </View>
  );
}
