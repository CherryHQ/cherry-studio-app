import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import {
  Composer,
  type ComposerInputProps,
  useComposerExpansion,
} from '@cherrystudio/ui/components';
import {
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type StyleProp, type TextStyle, View } from 'react-native';

import {
  ComposerEditor,
  ComposerEditorAccessories,
  ComposerSurface,
  useComposerPresentationState,
  useComposerPresentationActions,
  useComposerState,
  useComposerSubmit,
} from '@/frontend/components/Composer';
import { hasComposerSendableContent } from '@/frontend/components/Composer/utils/composerAttachments';
import { usePreference } from '@/frontend/data/hooks';

import { ChatInputPrimaryAction } from '../../voice/ChatInputPrimaryAction';
import { DictationCancelAction } from '../../voice/DictationCancelAction';
import { DictationStatus } from '../../voice/DictationStatus';
import { useDictation } from '../../voice/useDictation';
import { useDictationAvailability } from '../../voice/useDictationAvailability';
import { ContextUsageDetail } from './components/ContextUsageDetail';
import { ContextUsageRing } from './components/ContextUsageRing';
import { deriveContextUsage, formatContextUsagePercent } from './utils/contextUsage';

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
  contextUsage?: ReturnType<typeof deriveContextUsage>;
  contextUsageSessionId?: string;
  contextUsageMessageId?: string;
  leadingAction?: ReactNode;
  secondaryAction?: ReactNode;
  trailingAction?: ReactNode;
  streaming: boolean;
  onStop?: () => void;
  fieldStyle?: StyleProp<TextStyle>;
  onLinkPress?: ComposerInputProps['onLinkPress'];
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
  contextUsage,
  contextUsageSessionId,
  contextUsageMessageId,
  leadingAction,
  secondaryAction,
  trailingAction,
  streaming,
  onStop,
  fieldStyle,
  onLinkPress,
  placeholder,
  attachmentMode = 'images',
  status,
  renderPrimary,
}: Omit<ChatInputSurfaceProps, 'dictation'> & {
  /** Replaces the secondary action and, unlike it, also shows in the resting row. */
  status?: ReactNode;
  renderPrimary?: (send: ReactNode) => ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { runInputReplacement } = useComposerPresentationActions();
  const owner = contextUsage
    ? JSON.stringify([contextUsageSessionId, contextUsageMessageId])
    : undefined;
  const [ownership, setOwnership] = useState({ owner, generation: 0 });
  if (ownership.owner !== owner) {
    setOwnership({ owner, generation: ownership.generation + 1 });
  }
  const ownerRef = useRef(ownership);
  useLayoutEffect(() => {
    ownerRef.current = ownership;
  }, [ownership]);
  const [sheetOwner, setSheetOwner] = useState<{ owner: string; generation: number }>();
  const [submitOnReturn] = usePreference('chat.input.enter_to_send');
  const submit = useComposerSubmit();
  const { isEditing } = useComposerPresentationState();
  const { attachments, draft } = useComposerState();
  const isExpanded = useComposerExpansion()?.state.isExpanded ?? false;
  const active = isEditing || isExpanded || draft.length > 0 || attachments.length > 0;
  const hasFollowUp = onStop !== undefined && hasComposerSendableContent(draft, attachments);
  const send = (
    <Composer.Send
      testID={streaming && !hasFollowUp ? 'chat-composer-stop' : 'chat-composer-send'}
    />
  );
  const ring = contextUsage ? (
    <ContextUsageRing
      arcRatio={contextUsage.arcRatio}
      severity={contextUsage.severity}
      label={
        contextUsage.ratio === undefined
          ? t('chat.contextUsage.accessibilityUnavailable')
          : t('chat.contextUsage.accessibilityLabel', {
              percent: formatContextUsagePercent(
                contextUsage.ratio,
                i18n.resolvedLanguage ?? i18n.language,
              ),
            })
      }
      onPress={() => {
        const captured = ownerRef.current;
        void runInputReplacement(() => {
          if (captured.owner && ownerRef.current === captured)
            setSheetOwner({ owner: captured.owner, generation: captured.generation });
        });
      }}
      testID={isEditing ? 'chat-context-usage-editing' : 'chat-context-usage-compact'}
    />
  ) : null;
  return (
    <>
      <ComposerEditor
        compactAccessory={!active ? ring : undefined}
        active={active}
        attachmentMode={attachmentMode}
        fieldStyle={fieldStyle}
        onLinkPress={onLinkPress}
        onReturnSubmit={submit}
        placeholder={placeholder}
        submitOnReturn={submitOnReturn}
        testID="chat-composer"
      >
        {leadingAction ?? <View className="w-8" />}
        {status ?? <Composer.EditorSecondary>{secondaryAction}</Composer.EditorSecondary>}
        {streaming && hasFollowUp && onStop ? (
          <Composer.EditorSecondary>
            <Composer.Action
              accessibilityLabel={t('chat.input.action.stopGenerating')}
              className="bg-transparent"
              onPress={onStop}
              testID="chat-composer-stop"
            >
              <PauseIcon className="size-6 text-foreground" />
            </Composer.Action>
          </Composer.EditorSecondary>
        ) : null}
        <View className="ml-auto flex-row items-center gap-2" pointerEvents="box-none">
          {active ? ring : null}
          {trailingAction ? (
            <Composer.EditorSecondary>{trailingAction}</Composer.EditorSecondary>
          ) : null}
          {renderPrimary ? renderPrimary(send) : send}
        </View>
      </ComposerEditor>
      {contextUsage &&
      owner &&
      sheetOwner?.owner === owner &&
      sheetOwner.generation === ownership.generation ? (
        <ContextUsageDetail
          open
          onClose={() => setSheetOwner(undefined)}
          usage={contextUsage}
          sessionId={contextUsageSessionId}
          testID="chat-context-usage-detail"
        />
      ) : null}
    </>
  );
}
