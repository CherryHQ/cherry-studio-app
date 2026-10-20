import {
  BackgroundPressExclusion,
  Button,
  ContextMenu,
  ContextMenuExclusion,
  InfoPopover,
  type MenuItem,
} from '@cherrystudio/ui/components';
import { memo, type ReactElement, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar, ModelAvatar } from '@/frontend/components/Avatar';
import { AssistantMessage, type MessageListItem, UserMessage } from '@/frontend/components/Message';

import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { MessageTranslationContent } from '../translation/MessageTranslation';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';
import { MessageAnswerTabs } from './MessageAnswerTabs';

export type AssistantMessagePresentation = Readonly<{
  avatar?: null | string;
  avatarUri?: null | string;
  emoji?: string;
  name: string;
}>;

type ChatMessageProps = {
  assistantPresentation: AssistantMessagePresentation;
  isMessageActionsEnabled: boolean;
  isScreenReaderEnabled?: boolean;
  message: MessageListItem;
  shouldShowTimestamp: boolean;
  attachments?: ReactNode;
  accessories?: ReactNode;
  /** A stable renderer, called here so the row's memo boundary still holds. */
  renderUsage?: (message: MessageListItem) => ReactNode;
};

// Keeps the model icon on the line of the name's last character.
const WORD_JOINER = '\u2060';

/**
 * The agent's name always shows in full and wraps rather than truncating. The
 * model gives way first: its name shows only when it fits whole on the name's
 * line, and otherwise its icon alone trails the name. Tapping the header names
 * the model either way.
 */
function AssistantMessageHeader({
  message,
  presentation,
}: {
  message: MessageListItem;
  presentation: AssistantMessagePresentation;
}) {
  const { t } = useTranslation();
  const [isNameWrapped, setIsNameWrapped] = useState(false);
  // Several answers name their models in the tabs below instead.
  const model = message.branch ? undefined : message.model;

  const header = (
    <View className="w-full flex-row items-start gap-2">
      <AgentAvatar
        accessibilityLabel={presentation.name}
        avatar={presentation.avatar}
        emoji={presentation.emoji}
        name={presentation.name}
        size={24}
        uri={presentation.avatarUri}
      />
      {/* Centres the first line on the avatar. A model name that does not fit wraps onto a
          zero-height line below the name, which this row clips away. */}
      <View className="mt-0.5 min-w-0 flex-1 flex-row flex-wrap gap-x-1 overflow-hidden">
        <Text
          className="min-w-0 shrink font-semibold text-foreground text-sm"
          onTextLayout={
            model ? (event) => setIsNameWrapped(event.nativeEvent.lines.length > 1) : undefined
          }
        >
          {presentation.name}
          {model ? (
            <>
              {WORD_JOINER}
              {/* An inline view rests on the baseline; per-platform offsets centre it on the
                  glyphs. */}
              <View className="translate-y-px pl-1.5 android:translate-y-[3px]">
                <ModelAvatar model={model} size={16} />
              </View>
            </>
          ) : null}
        </Text>
        {/* A wrapped name leaves no line to share, even where its first line has room. Text
            measures no taller than its parent, so a hidden copy sizes the slot and the shown
            copy floats free of it. */}
        {model && !isNameWrapped ? (
          <View className="h-0">
            <Text className="text-sm opacity-0">{model.name}</Text>
            <Text className="absolute top-0 left-0 text-foreground-tertiary text-sm">
              {model.name}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!model) return header;
  return (
    <BackgroundPressExclusion>
      <InfoPopover
        accessibilityLabel={t('chat.message.answeredBy', {
          agent: presentation.name,
          model: model.name,
        })}
        testID="assistant-message-model"
        text={model.name}
      >
        {header}
      </InfoPopover>
    </BackgroundPressExclusion>
  );
}

function renderChatAssistantMessage(
  message: MessageListItem,
  presentation: AssistantMessagePresentation,
  attachments: ReactNode,
  accessories: ReactNode,
  renderUsage: ((message: MessageListItem) => ReactNode) | undefined,
) {
  return (
    <View className="w-full gap-2.5">
      <AssistantMessageHeader message={message} presentation={presentation} />
      {/* Above the answer so parallel answers can be compared while they still stream. */}
      {message.branch ? <MessageAnswerTabs message={message} /> : null}
      <AssistantMessage message={message}>
        {attachments ? <View className="w-full gap-2">{attachments}</View> : null}
        {accessories}
        {message.status !== 'pending' ? (
          <BackgroundPressExclusion>
            <ContextMenuExclusion className="w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <AssistantMessageToolbar message={message} />
              <View className="min-w-0 max-w-full flex-1 items-end">{renderUsage?.(message)}</View>
            </ContextMenuExclusion>
          </BackgroundPressExclusion>
        ) : null}
        <MessageTranslationContent message={message} />
      </AssistantMessage>
    </View>
  );
}

function formatMessageCreatedAt(createdAt: string | undefined): string | undefined {
  if (!createdAt) {
    return undefined;
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}/${day} ${hour}:${minute}`;
}

export const ChatMessage = memo(function ChatMessage({
  assistantPresentation,
  isMessageActionsEnabled,
  isScreenReaderEnabled = false,
  message,
  shouldShowTimestamp,
  attachments,
  accessories,
  renderUsage,
}: ChatMessageProps) {
  const createdAt = shouldShowTimestamp ? formatMessageCreatedAt(message.createdAt) : undefined;
  const content =
    message.role === 'user' ? (
      <View className="gap-2">
        <UserMessage attachments={attachments} message={message} />
        {accessories}
      </View>
    ) : (
      renderChatAssistantMessage(
        message,
        assistantPresentation,
        attachments,
        accessories,
        renderUsage,
      )
    );

  return (
    <View className="w-full gap-3" testID={`chat-message-${message.id}`}>
      {createdAt ? (
        <Text
          className="text-center font-mono text-muted-foreground text-xs"
          testID="chat-message-time"
        >
          {createdAt}
        </Text>
      ) : null}
      {isMessageActionsEnabled ? (
        <ChatMessageContextMenu isScreenReaderEnabled={isScreenReaderEnabled} message={message}>
          {content}
        </ChatMessageContextMenu>
      ) : (
        content
      )}
    </View>
  );
});

function ChatMessageContextMenu({
  children,
  isScreenReaderEnabled,
  message,
}: {
  children: ReactElement;
  isScreenReaderEnabled: boolean;
  message: MessageListItem;
}) {
  const { t } = useTranslation();
  const { copyAssistantMessage, shareAssistantMessage } = useAssistantMessageActions();
  // These existing actions and the text projection accept either message role.
  const text =
    message.status === 'pending' ? '' : copyAssistantMessageText(message.data.parts ?? []);
  // Non-destructive actions only. A long press competes with native text
  // selection and lands on whatever the finger happens to reach, which is not
  // a gesture that should be able to remove a turn.
  const items: readonly MenuItem[] =
    message.status === 'pending'
      ? []
      : [
          {
            disabled: !text,
            id: 'copy',
            label: t('common.copy'),
            onPress: () => copyAssistantMessage({ messageId: message.id, text }),
          },
          {
            id: 'share',
            label: t('chat.share.title'),
            onPress: () => shareAssistantMessage({ messageId: message.id }),
          },
        ];

  return (
    <ContextMenu items={items}>
      <View accessible={false} className="w-full gap-2">
        {children}
        {/* Keep attachment and text nodes independently reachable. Assistant rows already
            have a toolbar; user rows need explicit actions when long press is unavailable. */}
        {isScreenReaderEnabled && message.role === 'user' && items.length > 0 ? (
          <BackgroundPressExclusion>
            <ContextMenuExclusion className="flex-row justify-end gap-1">
              {items
                .filter((item) => !item.disabled)
                .map((item) => (
                  <Button
                    accessibilityLabel={item.label}
                    key={item.id}
                    onPress={item.onPress}
                    size="xs"
                    testID={`user-message-${item.id}`}
                    variant="ghost"
                  >
                    {item.label}
                  </Button>
                ))}
            </ContextMenuExclusion>
          </BackgroundPressExclusion>
        ) : null}
      </View>
    </ContextMenu>
  );
}
