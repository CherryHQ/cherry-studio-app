import AtSignIcon from '@cherrystudio/app-icons/icons/at-sign';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import SplitIcon from '@cherrystudio/app-icons/icons/split';
import SquareIcon from '@cherrystudio/app-icons/icons/square';
import Volume2Icon from '@cherrystudio/app-icons/icons/volume-2';
import {
  ActionMenu,
  Button,
  OptionPickerBottomSheet,
  Spinner,
  type MenuItem,
} from '@cherrystudio/ui/components';
import { memo, useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { AssistantMessageActionId } from '@/shared/data/types/assistantMessageToolbar';
import { APP_LANGUAGES, type AppLanguage } from '@/shared/utils/languages';

import { useMessageSpeech } from '../../../voice/useMessageSpeech';
import {
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../context/AssistantMessageActionsProvider';
import { useMessageTranslation } from '../translation/MessageTranslationProvider';
import { copyAssistantMessageText } from '../utils/copyAssistantMessageText';
import {
  hasSpeakableAssistantMessageText,
  speechAssistantMessageText,
} from '../utils/speechAssistantMessageText';

type AssistantMessageToolbarProps = {
  message: MessageListItem;
};

function PreparingSpeechSpinner() {
  const foregroundColor = useThemeColor('foreground');
  return (
    <Spinner
      accessibilityElementsHidden
      accessible={false}
      color={foregroundColor}
      importantForAccessibility="no-hide-descendants"
      size="sm"
    />
  );
}

/**
 * The shared preference chooses placement; each message still owns action availability.
 */
export const AssistantMessageToolbar = memo(function AssistantMessageToolbar({
  message,
}: AssistantMessageToolbarProps) {
  const { t } = useTranslation();
  const [isTranslationLanguagePickerOpen, setIsTranslationLanguagePickerOpen] = useState(false);
  const {
    answerableMessageIds,
    copiedMessageId,
    isAssistantToolbarEnabled,
    isDeleteDisabled,
    isRetryDisabled,
    retryableMessageIds,
    editableAnswerIds,
    isEditAnswerDisabled,
    toolbarConfig,
  } = useAssistantMessageActionsState();
  const {
    answerWithModel,
    editAnswer,
    copyAssistantMessage,
    deleteMessageTurn,
    forkFromAssistantMessage,
    retryAssistantMessage,
    shareAssistantMessage,
    openToolbarManager,
  } = useAssistantMessageActions();
  const translation = useMessageTranslation(message);
  const isSettled = isAssistantToolbarEnabled && message.status !== 'pending';
  const copyText = useMemo(
    () =>
      isSettled
        ? copyAssistantMessageText(message.data.parts ?? [], message.data.citationSources)
        : '',
    [isSettled, message],
  );
  const canReadAloud = useMemo(
    () =>
      isSettled &&
      hasSpeakableAssistantMessageText(message.data.parts ?? [], message.data.citationSources),
    [isSettled, message.data.parts, message.data.citationSources],
  );
  const getSpeechText = useCallback(
    () => speechAssistantMessageText(message.data.parts ?? [], message.data.citationSources),
    [message.data.parts, message.data.citationSources],
  );
  const speech = useMessageSpeech(message.id, getSpeechText);
  const isSpeechPreparing = speech.phase === 'preparing';
  const isCopied = copiedMessageId === message.id;
  // Turn-scoped, so a row with no turn — synthetic, or not yet reserved — has
  // nothing to delete.
  const turnId = message.turnId;
  if (!isSettled) {
    return null;
  }

  const hasTranslation = translation ? translation.state.status !== 'idle' : false;
  const actions: Partial<
    Record<
      AssistantMessageActionId,
      Omit<MenuItem, 'icon'> & { icon?: ReactElement<{ className?: string }>; testID?: string }
    >
  > = {
    ...(copyText
      ? {
          copy: {
            id: 'copy',
            label: t(isCopied ? 'chat.messageActions.copied' : 'common.copy'),
            icon: isCopied ? (
              <CheckIcon className="text-success" size={15} />
            ) : (
              <CopyIcon className="text-muted-foreground" size={15} />
            ),
            onPress: () => copyAssistantMessage({ messageId: message.id, text: copyText }),
            testID: 'assistant-message-copy',
          },
        }
      : {}),
    ...(canReadAloud || speech.phase !== 'idle'
      ? {
          readAloud: {
            id: 'readAloud',
            label: t(
              isSpeechPreparing
                ? 'voice.speech.preparingStop'
                : speech.isSpeaking
                  ? 'voice.speech.stop'
                  : 'voice.speech.start',
            ),
            icon: isSpeechPreparing ? (
              <PreparingSpeechSpinner />
            ) : speech.isSpeaking ? (
              <SquareIcon className="text-foreground" size={15} />
            ) : (
              <Volume2Icon className="text-muted-foreground" size={15} />
            ),
            onPress: speech.toggle,
            testID: 'assistant-message-read-aloud',
          },
        }
      : {}),
    ...(retryAssistantMessage && retryableMessageIds.has(message.id)
      ? {
          retry: {
            id: 'retry',
            label: t(
              message.status === 'success' ? 'chat.messageActions.regenerate' : 'common.retry',
            ),
            disabled: isRetryDisabled,
            icon: <RotateCcwIcon className="text-muted-foreground" size={15} />,
            onPress: () => retryAssistantMessage({ messageId: message.id }),
            testID: 'assistant-message-retry',
          },
        }
      : {}),
    ...(answerWithModel && answerableMessageIds.has(message.id)
      ? {
          answerWith: {
            id: 'answerWith',
            label: t('chat.messageActions.answerWith'),
            disabled: isRetryDisabled,
            icon: <AtSignIcon className="text-muted-foreground" size={15} />,
            onPress: () => answerWithModel({ messageId: message.id }),
            testID: 'assistant-message-answer-with',
          },
        }
      : {}),
    ...(forkFromAssistantMessage
      ? {
          fork: {
            id: 'fork',
            label: t('chat.messageActions.fork'),
            icon: <SplitIcon className="text-muted-foreground" size={15} />,
            onPress: () => forkFromAssistantMessage({ messageId: message.id }),
            testID: 'assistant-message-fork',
          },
        }
      : {}),
    ...(editAnswer && editableAnswerIds.has(message.id)
      ? {
          edit: {
            id: 'edit',
            label: t('chat.messageActions.editAnswerAction'),
            disabled: isEditAnswerDisabled,
            icon: <PencilIcon className="text-muted-foreground" size={15} />,
            onPress: () => editAnswer({ messageId: message.id }),
            testID: 'assistant-message-edit',
          },
        }
      : {}),
    ...(translation
      ? {
          translate: {
            id: 'translate',
            label: t(
              hasTranslation
                ? translation.state.visible
                  ? 'chat.translation.hide'
                  : 'chat.translation.show'
                : 'chat.translation.translate',
            ),
            icon: (
              <LanguagesIcon
                className={
                  hasTranslation && translation.state.visible
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }
                size={15}
              />
            ),
            onPress: () => {
              if (hasTranslation) {
                translation.store.toggle(translation.source);
              } else {
                Keyboard.dismiss();
                setIsTranslationLanguagePickerOpen(true);
              }
            },
            testID: 'assistant-message-translate',
          },
        }
      : {}),
    share: {
      id: 'share',
      label: t('chat.messageActions.share'),
      icon: <ShareIcon className="text-muted-foreground" size={15} />,
      onPress: () => shareAssistantMessage({ messageId: message.id }),
      testID: 'assistant-message-share',
    },
    ...(deleteMessageTurn && turnId
      ? {
          delete: {
            id: 'delete',
            destructive: true,
            disabled: isDeleteDisabled,
            label: t('common.delete'),
            onPress: () => deleteMessageTurn({ turnId, messageId: message.id }),
          },
        }
      : {}),
  };
  const menuItems: MenuItem[] = toolbarConfig.overflow.flatMap((id) => {
    const action = actions[id];
    if (!action) return [];
    const { icon: _icon, testID: _testID, ...item } = action;
    return [
      {
        ...item,
        group: 'actions',
        onPress:
          id === 'copy'
            ? () =>
                copyAssistantMessage({ messageId: message.id, text: copyText, notifySuccess: true })
            : item.onPress,
      },
    ];
  });
  if (openToolbarManager) {
    menuItems.push({
      group: 'manage',
      id: 'manage',
      label: t('chat.messageActions.manage'),
      onPress: openToolbarManager,
    });
  }

  return (
    <View className="min-h-7 flex-row items-center gap-1" testID="assistant-message-toolbar">
      {toolbarConfig.pinned.map((id) => {
        const action = actions[id];
        const isPreparing = id === 'readAloud' && isSpeechPreparing;
        return action ? (
          <Button
            key={id}
            accessibilityLabel={isPreparing ? t('voice.speech.stop') : action.label}
            accessibilityState={isPreparing ? { busy: true } : undefined}
            disabled={action.disabled}
            icon={action.icon}
            onPress={action.onPress}
            size="xs"
            testID={action.testID}
            variant="ghost"
          />
        ) : null;
      })}
      <ActionMenu items={menuItems}>
        <Button
          accessibilityLabel={t('common.more')}
          icon={<EllipsisIcon className="text-muted-foreground" size={15} />}
          size="xs"
          testID="assistant-message-more"
          variant="ghost"
        />
      </ActionMenu>
      {translation && isTranslationLanguagePickerOpen ? (
        <OptionPickerBottomSheet<AppLanguage | ''>
          onClose={() => setIsTranslationLanguagePickerOpen(false)}
          onValueChange={(language) => {
            if (language) void translation.store.start(translation.source, language);
          }}
          open
          options={APP_LANGUAGES}
          selectedValue=""
          size="large"
          testID="message-translation-language-picker"
          title={t('chat.translation.translate')}
        />
      ) : null}
    </View>
  );
});
