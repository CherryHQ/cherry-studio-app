import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import { Composer } from '@cherrystudio/ui/components';
import { type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type StyleProp, type TextStyle, View } from 'react-native';

import {
  ComposerEditor,
  ComposerEditorAccessories,
  ComposerSurface,
  useComposerPresentationState,
  useComposerState,
} from '@/frontend/components/Composer';
import { hasComposerSendableContent } from '@/frontend/components/Composer/utils/composerAttachments';

import { ChatInputPrimaryAction } from '../../voice/ChatInputPrimaryAction';
import { DictationCancelAction } from '../../voice/DictationCancelAction';
import { DictationStatus } from '../../voice/DictationStatus';
import { useDictation } from '../../voice/useDictation';
import { useDictationAvailability } from '../../voice/useDictationAvailability';

/** A drafted follow-up can be admitted while Pi continues its current answer. */
export function ChatInputComposer(props: ComponentProps<typeof ComposerSurface>) {
  const { attachments, draft } = useComposerState();
  return (
    <ComposerSurface
      {...props}
      streaming={props.streaming && !hasComposerSendableContent(draft, attachments)}
    />
  );
}

export function ChatInputAccessories({ children }: PropsWithChildren) {
  return <ComposerEditorAccessories testID="chat-composer">{children}</ComposerEditorAccessories>;
}

type ChatInputSurfaceProps = {
  leadingAction?: ReactNode;
  secondaryAction?: ReactNode;
  trailingAction?: ReactNode;
  streaming: boolean;
  onStop?: () => void;
  fieldStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  attachmentMode?: 'images' | 'text-only';
  /** Voice input takes the send slot while there is nothing to send. */
  dictation?: boolean;
};

export function ChatInputSurface({ dictation = false, ...props }: ChatInputSurfaceProps) {
  return dictation ? <DictationChatInputSurface {...props} /> : <ChatInputLayout {...props} />;
}

/**
 * Dictation spans three slots: cancel replaces the leading action, its status stands in for the
 * placeholder until text arrives, and the primary slot finishes it.
 */
function DictationChatInputSurface(props: Omit<ChatInputSurfaceProps, 'dictation'>) {
  const dictation = useDictation();
  const canDictate = useDictationAvailability();
  const { draft } = useComposerState();
  const { state } = dictation;
  const status = (state === 'listening' || state === 'finishing') && !draft ? state : null;
  return (
    <ChatInputLayout
      {...props}
      leadingAction={
        state === 'idle' ? (
          props.leadingAction
        ) : (
          <DictationCancelAction onCancel={dictation.cancel} />
        )
      }
      placeholder={status ? '' : props.placeholder}
      status={status ? <DictationStatus state={status} /> : undefined}
      renderPrimary={(send) => (
        <ChatInputPrimaryAction
          canDictate={canDictate}
          dictation={dictation}
          send={send}
          streaming={props.streaming}
        />
      )}
    />
  );
}

function ChatInputLayout({
  leadingAction,
  secondaryAction,
  trailingAction,
  streaming,
  onStop,
  fieldStyle,
  placeholder,
  attachmentMode = 'images',
  status,
  renderPrimary,
}: Omit<ChatInputSurfaceProps, 'dictation'> & {
  /** Replaces the secondary action and, unlike it, also shows in the resting row. */
  status?: ReactNode;
  renderPrimary?: (send: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const { isEditing } = useComposerPresentationState();
  const { attachments, draft } = useComposerState();
  const hasFollowUp = onStop !== undefined && hasComposerSendableContent(draft, attachments);
  const send = (
    <Composer.Send
      testID={streaming && !hasFollowUp ? 'chat-composer-stop' : 'chat-composer-send'}
    />
  );
  return (
    <ComposerEditor
      active={isEditing || draft.length > 0 || attachments.length > 0}
      attachmentMode={attachmentMode}
      fieldStyle={fieldStyle}
      placeholder={placeholder}
      testID="chat-composer"
    >
      {leadingAction ?? <View className="w-8" />}
      {status ?? <Composer.EditorSecondary>{secondaryAction}</Composer.EditorSecondary>}
      <View className="ml-auto flex-row items-center gap-2" pointerEvents="box-none">
        {trailingAction ? (
          <Composer.EditorSecondary>{trailingAction}</Composer.EditorSecondary>
        ) : null}
        {streaming && hasFollowUp && onStop ? (
          <Composer.Action
            accessibilityLabel={t('chat.input.action.stopGenerating')}
            className="bg-transparent"
            onPress={onStop}
            testID="chat-composer-stop"
          >
            <PauseIcon className="size-6 text-foreground" />
          </Composer.Action>
        ) : null}
        {renderPrimary ? renderPrimary(send) : send}
      </View>
    </ComposerEditor>
  );
}
