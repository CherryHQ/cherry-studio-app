import { Composer } from '@cherrystudio/ui/components';
import type { IconSource } from '@cherrystudio/ui/icons';
import ExpoQuickLook from '@magrinj/expo-quick-look';
import type { PasteEventPayload } from 'expo-paste-input';
import { useToast } from 'heroui-native/toast';
import { Settings2Icon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions, useComposerMeta, useComposerState } from '../context/ComposerProvider';
import {
  type ComposerAttachmentDraft,
  createPastedImageAttachmentDraft,
  hasComposerSendableContent,
} from '../utils/composerAttachments';
import { ComposerAttachmentStrip } from './ComposerAttachmentStrip';
import { ComposerMenu } from './ComposerMenu';

const logger = loggerService.withContext('ComposerCore');

type ComposerCoreProps = {
  /** A row above the attachments; chat puts its selected-tool tag here. */
  accessory?: ReactNode;
  allowEmptySend?: boolean;
  dismissKeyboardOnSend?: boolean;
  getSendErrorLabel?: (error: unknown) => string | undefined;
  isSendEnabled: boolean;
  isStreaming: boolean;
  /** Extra rows in the ＋ menu, below the media ones. */
  menuItems?: ReactNode;
  /** Trailing content inside the model pill; chat puts its effort label here. */
  modelBadge?: ReactNode;
  /** Themed icon for the selected model; the pill falls back to the label's initial. */
  modelIcon?: IconSource;
  modelLabel?: string;
  modelSettings?: ComposerModelSettings;
  onModelPickerPress: () => void;
  onSendPress: (payload: ComposerSendPayload) => Promise<void>;
  onStopPress: () => void;
};

export type ComposerModelSettings = {
  accessibilityLabel: string;
  onPress: () => void;
};

export type ComposerSendPayload = {
  attachments: readonly ComposerAttachmentDraft[];
  text: string;
};

/**
 * The app's input surface, composed from the shared `Composer`. Everything here
 * is what the package deliberately does not know about: attachments, the
 * pickers behind the ＋ menu, the model pill, async send with recovery. What is
 * specific to one caller — chat's tools and reasoning effort, painting's image
 * params — arrives through the `accessory` / `menuItems` / `modelBadge` slots
 * instead of being modelled here.
 */
export function ComposerCore({
  accessory,
  allowEmptySend = false,
  dismissKeyboardOnSend = true,
  getSendErrorLabel,
  isSendEnabled,
  isStreaming,
  menuItems,
  modelBadge,
  modelIcon,
  modelLabel,
  modelSettings,
  onModelPickerPress,
  onSendPress,
  onStopPress,
}: ComposerCoreProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addAttachments, clearAttachments, removeAttachment, setAttachments, setDraft } =
    useComposerActions();
  const { inputRef } = useComposerMeta();
  const { attachments, draft } = useComposerState();

  const handleAttachmentPreview = useCallback((attachment: ComposerAttachmentDraft) => {
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
      canSend={isSendEnabled && (allowEmptySend || hasComposerSendableContent(draft, attachments))}
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
      <Composer.Collapsible>{accessory}</Composer.Collapsible>
      <Composer.Collapsible style={attachmentRowStyle}>
        {attachments.length > 0 ? (
          <ComposerAttachmentStrip
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
        <ComposerMenu items={menuItems} />
        {modelSettings ? (
          <Composer.Action
            accessibilityLabel={modelSettings.accessibilityLabel}
            onPress={handleModelSettingsPress}
            testID="composer-model-settings-button"
          >
            <Settings2Icon className="size-4 text-default-foreground" strokeWidth={2} />
          </Composer.Action>
        ) : null}
        <ComposerModelPill
          badge={modelBadge}
          modelIcon={modelIcon}
          modelLabel={modelLabel}
          onPress={handleModelPickerPress}
        />
        <Composer.Send />
      </Composer.Toolbar>
    </Composer>
  );
}

function ComposerModelPill({
  badge,
  modelIcon,
  modelLabel,
  onPress,
}: {
  badge?: ReactNode;
  modelIcon?: IconSource;
  modelLabel?: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();

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
      testID="composer-model-button"
    >
      <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
        {modelLabel}
      </Text>
      {badge}
    </Composer.Pill>
  );
}

const modelIconStyle = { height: 18, width: 18 } as const;
// The tiles bleed to the surface's edge horizontally so the row reads as
// scrollable, but keep the composer's own rhythm above and below.
const attachmentRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
