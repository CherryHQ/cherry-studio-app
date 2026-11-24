import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { BackgroundPressExclusion, Button, InfoPopover } from '@cherrystudio/ui/components';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentAvatar, ModelAvatar } from '@/frontend/components/Avatar';
import {
  AssistantMessage,
  type MessageListItem,
  UserMessage,
  useMessageListDisclosureToggle,
} from '@/frontend/components/Message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { MessageQuoteHighlight } from '../../../quotes/MessageQuoteHighlight';
import { MessageQuotePreview } from '../../../quotes/MessageQuotePreview';
import { ChatShareSelectionRow } from '../../../share/ChatShareControls';
import { useIsChatShareSelecting } from '../../../share/chatShareSelection';
import { useAssistantMessageActions } from '../context/AssistantMessageActionsProvider';
import { MessageTranslationContent } from '../translation/MessageTranslation';
import { AssistantMessageToolbar } from './AssistantMessageToolbar';
import { MessageAnswerGroup } from './MessageAnswerGroup';
import { UserMessageToolbar } from './UserMessageToolbar';

export type AssistantMessagePresentation = Readonly<{
  avatar?: null | string;
  avatarUri?: null | string;
  emoji?: string;
  name: string;
}>;

type ChatMessageProps = {
  assistantPresentation: AssistantMessagePresentation;
  isMessageActionsEnabled: boolean;
  message: MessageListItem;
  shouldShowDisclaimer?: boolean;
  shouldShowTimestamp: boolean;
  attachments?: ReactNode;
  accessories?: ReactNode;
  editingContext?: 'question' | 'continuation';
  startsEditingContinuation?: boolean;
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
  const isSelecting = useIsChatShareSelecting();
  // Several answers name their models on their own cards instead.
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
          className={
            isSelecting
              ? 'min-w-0 shrink font-medium text-foreground text-sm'
              : 'min-w-0 shrink font-semibold text-foreground text-sm'
          }
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

  if (!model || isSelecting) return header;
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

/**
 * An answer with its header and actions. Grouped answers use the preferred presentation;
 * a source that cannot switch answers shows only the selected one.
 */
function AssistantChatMessage({
  accessories,
  attachments,
  message,
  presentation,
  renderUsage,
  shouldShowDisclaimer = false,
}: {
  accessories: ReactNode;
  attachments: ReactNode;
  message: MessageListItem;
  presentation: AssistantMessagePresentation;
  renderUsage: ((message: MessageListItem) => ReactNode) | undefined;
  shouldShowDisclaimer?: boolean;
}) {
  const { t } = useTranslation();
  const { selectBranch } = useAssistantMessageActions();
  const isSelecting = useIsChatShareSelecting();
  const isGrouped = Boolean(message.branch && selectBranch && !isSelecting);
  const header = <AssistantMessageHeader message={message} presentation={presentation} />;
  const extras = (
    <>
      {attachments ? <View className="w-full gap-2">{attachments}</View> : null}
      {accessories}
      {message.status !== 'pending' && !isSelecting ? (
        <BackgroundPressExclusion>
          <View className="w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <AssistantMessageToolbar message={message} />
            <View className="min-w-0 max-w-full flex-1 items-end">{renderUsage?.(message)}</View>
          </View>
        </BackgroundPressExclusion>
      ) : null}
      <MessageTranslationContent message={message} />
      {shouldShowDisclaimer && message.status !== 'pending' && !isSelecting ? (
        <Text className="text-xs text-foreground-tertiary" testID="assistant-message-disclaimer">
          {t('chat.input.disclaimer')}
        </Text>
      ) : null}
    </>
  );

  return (
    <View className="w-full gap-2.5">
      {header}
      {isGrouped ? (
        <View className="w-full gap-2.5" pointerEvents={isSelecting ? 'none' : 'auto'}>
          <MessageAnswerGroup message={message}>{extras}</MessageAnswerGroup>
        </View>
      ) : (
        <AssistantMessage message={message}>{extras}</AssistantMessage>
      )}
    </View>
  );
}

/** The versions of an edited question, also available during generation. */
function UserQuestionBranch({ message }: { message: MessageListItem }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { selectBranch } = useAssistantMessageActions();
  const preserveReadingPosition = useMessageListDisclosureToggle();
  const siblings = message.questionBranch?.siblings;
  if (!siblings || siblings.length < 2 || !selectBranch) return null;
  const index = Math.max(0, siblings.indexOf(message.id));
  return (
    <View className="flex-row items-center">
      <Button
        accessibilityLabel={t('chat.branch.previousQuestion')}
        disabled={index === 0}
        icon={<ChevronLeftIcon className="size-4 text-muted-foreground" />}
        onPress={() => {
          const targetId = siblings[index - 1];
          if (targetId) {
            preserveReadingPosition();
            void selectBranch({ messageId: message.id, targetId });
          }
        }}
        size="xs"
        testID="question-version-previous"
        variant="ghost"
      />
      <Text
        accessibilityLabel={t('chat.branch.questionPage', {
          index: index + 1,
          total: siblings.length,
        })}
        accessibilityLiveRegion="polite"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {(index + 1).toLocaleString(locale)}/{siblings.length.toLocaleString(locale)}
      </Text>
      <Button
        accessibilityLabel={t('chat.branch.nextQuestion')}
        disabled={index >= siblings.length - 1}
        icon={<ChevronRightIcon className="size-4 text-muted-foreground" />}
        onPress={() => {
          const targetId = siblings[index + 1];
          if (targetId) {
            preserveReadingPosition();
            void selectBranch({ messageId: message.id, targetId });
          }
        }}
        size="xs"
        testID="question-version-next"
        variant="ghost"
      />
    </View>
  );
}

function UserMessageFooter({
  isMessageActionsEnabled,
  message,
}: {
  isMessageActionsEnabled: boolean;
  message: MessageListItem;
}) {
  const isSelecting = useIsChatShareSelecting();
  const { selectBranch } = useAssistantMessageActions();
  if (isSelecting) return null;
  const hasBranch = Boolean(selectBranch) && (message.questionBranch?.siblings.length ?? 0) >= 2;
  const showToolbar = isMessageActionsEnabled && message.status !== 'pending';
  if (!hasBranch && !showToolbar) return null;
  return (
    <BackgroundPressExclusion>
      <View className="min-h-7 w-full flex-row items-center justify-end gap-2">
        {hasBranch ? <UserQuestionBranch message={message} /> : null}
        {showToolbar ? <UserMessageToolbar message={message} /> : null}
      </View>
    </BackgroundPressExclusion>
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
  message,
  shouldShowDisclaimer = false,
  shouldShowTimestamp,
  attachments,
  accessories,
  renderUsage,
  editingContext,
  startsEditingContinuation = false,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const isSelecting = useIsChatShareSelecting();
  const quotePart = message.data.parts?.find(
    (part) => part.type === 'text' && readCherryMeta(part)?.quotes,
  );
  const quoteFields = quotePart?.type === 'text' ? readCherryMeta(quotePart) : undefined;
  const createdAt = shouldShowTimestamp ? formatMessageCreatedAt(message.createdAt) : undefined;
  const content =
    message.role === 'user' ? (
      <View className="gap-1">
        <UserMessage
          variant={isSelecting ? 'selection' : 'default'}
          editingContext={isSelecting ? undefined : editingContext}
          attachments={attachments}
          message={message}
          quote={quoteFields?.quotes ? <MessageQuotePreview fields={quoteFields} /> : undefined}
        />
        {accessories}
        <UserMessageFooter isMessageActionsEnabled={isMessageActionsEnabled} message={message} />
      </View>
    ) : (
      <AssistantChatMessage
        accessories={accessories}
        attachments={attachments}
        message={message}
        presentation={assistantPresentation}
        renderUsage={renderUsage}
        shouldShowDisclaimer={shouldShowDisclaimer}
      />
    );

  return (
    <View className="w-full gap-3" testID={`chat-message-${message.id}`}>
      <MessageQuoteHighlight messageId={message.id} />
      {startsEditingContinuation && !isSelecting ? (
        <Text className="text-xs text-muted-foreground" testID="editing-original-continuation">
          {t('chat.input.editing.continuation')}
        </Text>
      ) : null}
      {createdAt ? (
        <Text
          className="text-center font-mono text-muted-foreground text-xs"
          testID="chat-message-time"
        >
          {createdAt}
        </Text>
      ) : null}
      <View>
        {/* Keep descendant body/attachment contrast intact. The grouping edge and quieter
            question surfaces lower emphasis without dimming readable content to 35%. */}
        {editingContext === 'continuation' && !isSelecting ? (
          <View
            pointerEvents="none"
            className="absolute -left-2 top-0 bottom-0 border-l border-border-subtle"
            testID="editing-continuation-edge"
          />
        ) : null}
        <ChatShareSelectionRow message={message}>{content}</ChatShareSelectionRow>
      </View>
    </View>
  );
});
