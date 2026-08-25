import { Composer } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ComposerAttachments,
  ComposerField,
  type ComposerSendPayload,
  ComposerSurface,
} from '@/frontend/components/composer';

import { useAgentChatControls } from '../runtime';

type ChatInputProps = {
  agentId?: string;
  dismissKeyboardOnSend?: boolean;
  sessionId?: string;
};

class AgentAttachmentsUnsupportedError extends Error {}

export function ChatInput({ agentId, dismissKeyboardOnSend, sessionId }: ChatInputProps) {
  const { t } = useTranslation();
  const { cancel, isBusy, sendText } = useAgentChatControls({ agentId, sessionId });
  const handleSendPress = useCallback(
    ({ attachments, text }: ComposerSendPayload) => {
      if (attachments.length > 0) {
        throw new AgentAttachmentsUnsupportedError();
      }
      return sendText(text);
    },
    [sendText],
  );
  const getSendErrorLabel = useCallback(
    (error: unknown) =>
      error instanceof AgentAttachmentsUnsupportedError
        ? t('chat.input.attachmentsUnsupported')
        : undefined,
    [t],
  );

  return (
    <ComposerSurface
      dismissKeyboardOnSend={dismissKeyboardOnSend}
      getSendErrorLabel={getSendErrorLabel}
      onSend={handleSendPress}
      onStop={() => void cancel()}
      streaming={isBusy}
    >
      {/* Pasted attachments remain visible and removable, but sending fails closed until
          the Host-side file resolver enables the protocol capability. */}
      <ComposerAttachments />
      <ComposerField />
      <Composer.Toolbar>
        <Composer.Send />
      </Composer.Toolbar>
    </ComposerSurface>
  );
}
