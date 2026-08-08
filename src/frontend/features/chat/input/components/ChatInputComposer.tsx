import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { Composer } from '@cherrystudio/ui/components';
import type { IconSource } from '@cherrystudio/ui/icons';
import ExpoQuickLook from '@magrinj/expo-quick-look';
import type { PasteEventPayload } from 'expo-paste-input';
import { useToast } from 'heroui-native/toast';
import { PlusIcon, Settings2Icon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  useChatInputActions,
  useChatInputMeta,
  useChatInputState,
} from '../context/ChatInputProvider';
import { thinkingAccentColor } from '../effortSlider';
import {
  type ChatInputAttachmentDraft,
  createPastedImageAttachmentDraft,
  hasChatInputSendableContent,
} from '../utils/chatInputAttachments';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';
import { ChatInputAttachmentStrip } from './ChatInputAttachmentStrip';
import { ChatInputToolTag } from './ChatInputToolTag';

const emptyReasoningEfforts: readonly ChatInputReasoningEffort[] = [];

const logger = loggerService.withContext('ChatInputComposer');

type ChatInputComposerProps = {
  allowEmptySend?: boolean;
  dismissKeyboardOnSend?: boolean;
  getSendErrorLabel?: (error: unknown) => string | undefined;
  isSendEnabled: boolean;
  isStreaming: boolean;
  /** Themed icon for the selected model; the pill falls back to the label's initial. */
  modelIcon?: IconSource;
  modelLabel?: string;
  modelSettings?: ChatInputModelSettings;
  onModelPickerPress: () => void;
  onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
  onStopPress: () => void;
  onToolClear?: () => void;
  /** Reasoning stops of the selected model; empty hides the effort label in the pill. */
  reasoningEfforts?: readonly ChatInputReasoningEffort[];
};

export type ChatInputModelSettings = {
  accessibilityLabel: string;
  onPress: () => void;
};

export type ChatInputSendPayload = {
  attachments: readonly ChatInputAttachmentDraft[];
  text: string;
};

/**
 * The chat input, composed from the shared `Composer`. Everything here is what
 * the package deliberately does not know about: attachments, the selected tool,
 * the model and its reasoning effort. The shell, the rows' swell and shrink, and
 * the send button are the package's.
 */
export function ChatInputComposer({
  allowEmptySend = false,
  dismissKeyboardOnSend = true,
  getSendErrorLabel,
  isSendEnabled,
  isStreaming,
  modelIcon,
  modelLabel,
  modelSettings,
  onModelPickerPress,
  onSendPress,
  onStopPress,
  onToolClear,
  reasoningEfforts = emptyReasoningEfforts,
}: ChatInputComposerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    addAttachments,
    clearAttachments,
    clearSelectedTool,
    openActionSheet,
    removeAttachment,
    setAttachments,
    setDraft,
  } = useChatInputActions();
  const { inputRef } = useChatInputMeta();
  const { attachments, draft, reasoningEffort, selectedTool } = useChatInputState();

  const handleAttachmentPreview = useCallback((attachment: ChatInputAttachmentDraft) => {
    void ExpoQuickLook.previewFile({
      editingMode: 'disabled',
      uri: attachment.uri,
    }).catch((error) => {
      logger.warn('Failed to preview attachment', error instanceof Error ? error : null);
    });
  }, []);
  const handlePaste = useCallback(
    (payload: PasteEventPayload) => {
      if (payload.type === 'images' && payload.uris.length > 0) {
        addAttachments(payload.uris.map(createPastedImageAttachmentDraft));
      }
    },
    [addAttachments],
  );
  // Anything that opens over the input takes the keyboard down first, so the
  // overlay does not have to animate around it. The ＋ menu is the exception:
  // it deliberately leaves the field as first responder, which is what makes
  // iOS restore the keyboard the instant the menu closes.
  const dismissInput = useCallback(() => {
    void KeyboardController.dismiss();
    inputRef.current?.blur();
  }, [inputRef]);
  const handleModelPickerPress = useCallback(() => {
    dismissInput();
    onModelPickerPress();
  }, [dismissInput, onModelPickerPress]);
  const handleModelSettingsPress = useCallback(() => {
    if (!modelSettings) {
      return;
    }

    dismissInput();
    modelSettings.onPress();
  }, [dismissInput, modelSettings]);
  const handleSend = useCallback(async () => {
    const draftSnapshot = draft;
    const attachmentSnapshot = [...attachments];

    setDraft('');
    clearAttachments();
    if (dismissKeyboardOnSend) {
      // Not animated: an animated dismissal races the message list's
      // scroll-to-bottom and the two fight over the same pixels.
      void KeyboardController.dismiss({ animated: false });
    }

    try {
      await onSendPress({ attachments: attachmentSnapshot, text: draftSnapshot.trim() });
    } catch (error) {
      // The toast is deliberately vague, so without this the failure leaves no
      // trace at all and there is nothing to go on when a send breaks on device.
      logger.error('Message send failed', error instanceof Error ? error : { error });
      setDraft(draftSnapshot);
      setAttachments(attachmentSnapshot);
      toast.show({
        label: getSendErrorLabel?.(error) ?? t('chat.input.sendFailed'),
        variant: 'danger',
      });
    }
  }, [
    attachments,
    clearAttachments,
    dismissKeyboardOnSend,
    draft,
    getSendErrorLabel,
    onSendPress,
    setAttachments,
    setDraft,
    t,
    toast,
  ]);

  return (
    <Composer
      canSend={isSendEnabled && (allowEmptySend || hasChatInputSendableContent(draft, attachments))}
      labels={{
        send: t('chat.input.action.sendMessage'),
        stop: t('chat.input.action.stopGenerating'),
      }}
      onChangeText={setDraft}
      onSend={handleSend}
      onStop={onStopPress}
      streaming={isStreaming}
      value={draft}
    >
      <Composer.Collapsible>
        {selectedTool ? (
          <ChatInputToolTag onClear={onToolClear ?? clearSelectedTool} tool={selectedTool} />
        ) : null}
      </Composer.Collapsible>
      <Composer.Collapsible style={attachmentRowStyle}>
        {attachments.length > 0 ? (
          <ChatInputAttachmentStrip
            attachments={attachments}
            onAttachmentPreview={handleAttachmentPreview}
            onAttachmentRemove={removeAttachment}
          />
        ) : null}
      </Composer.Collapsible>
      <Composer.Input
        onPaste={handlePaste}
        placeholder={t('chat.inputPlaceholder')}
        ref={inputRef}
      />
      <Composer.Toolbar>
        <Composer.Action accessibilityLabel="Add" onPress={openActionSheet}>
          <PlusIcon className="size-5 text-foreground" strokeWidth={2} />
        </Composer.Action>
        {modelSettings ? (
          <Composer.Action
            accessibilityLabel={modelSettings.accessibilityLabel}
            onPress={handleModelSettingsPress}
            testID="chat-input-model-settings-button"
          >
            <Settings2Icon className="size-4 text-default-foreground" strokeWidth={2} />
          </Composer.Action>
        ) : null}
        <ChatInputModelPill
          modelIcon={modelIcon}
          modelLabel={modelLabel}
          onPress={handleModelPickerPress}
          reasoningEffort={reasoningEffort}
          reasoningEfforts={reasoningEfforts}
        />
        <Composer.Send />
      </Composer.Toolbar>
    </Composer>
  );
}

function ChatInputModelPill({
  modelIcon,
  modelLabel,
  onPress,
  reasoningEffort,
  reasoningEfforts,
}: {
  modelIcon?: IconSource;
  modelLabel?: string;
  onPress: () => void;
  reasoningEffort: ChatInputReasoningEffort;
  reasoningEfforts: readonly ChatInputReasoningEffort[];
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const effortLabelKey =
    reasoningEfforts.length > 0
      ? getChatInputReasoningEffortOption(reasoningEffort)?.labelKey
      : undefined;

  if (!modelLabel) {
    return (
      <Composer.Pill accessibilityLabel={t('chat.model.select')} onPress={onPress}>
        <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
          {t('chat.model.select')}
        </Text>
      </Composer.Pill>
    );
  }

  return (
    <Composer.Pill
      accessibilityLabel={modelLabel}
      icon={
        modelIcon ? (
          <Image
            cachePolicy="memory-disk"
            contentFit="contain"
            source={modelIcon[theme === 'dark' ? 'dark' : 'light']}
            style={modelIconStyle}
          />
        ) : (
          <Text className="font-semibold text-foreground text-sm">
            {modelLabel.trim().charAt(0).toUpperCase() || 'M'}
          </Text>
        )
      }
      onPress={onPress}
      testID="chat-input-model-button"
    >
      <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
        {modelLabel}
      </Text>
      {effortLabelKey ? (
        <Text
          className="shrink-0 text-default-foreground text-sm"
          numberOfLines={1}
          style={
            reasoningEffort === REASONING_EFFORT.MAX
              ? { color: thinkingAccentColor[theme === 'dark' ? 'dark' : 'light'] }
              : undefined
          }
          testID="chat-input-model-effort-label"
        >
          {t(effortLabelKey)}
        </Text>
      ) : null}
    </Composer.Pill>
  );
}

const modelIconStyle = { height: 18, width: 18 } as const;
// The tiles bleed to the surface's edge horizontally so the row reads as
// scrollable, but keep the composer's own rhythm above and below.
const attachmentRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
