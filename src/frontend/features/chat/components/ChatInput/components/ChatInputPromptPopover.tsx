import MessageSquareTextIcon from '@cherrystudio/app-icons/icons/message-square-text';
import { Composer, Spinner, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerPresentationActions } from '@/frontend/components/Composer';
import { useMcpAppConversation } from '@/frontend/components/McpApp';
import { addMcpContentToDraft } from '@/frontend/components/McpContent';
import { useBackendModule } from '@/frontend/data';

import {
  type QuestionFormAnswer,
  type QuestionFormQuestion,
  UserQuestionSheet,
} from '../../UserQuestionSheet';
import type { ChatInputMcpPrompt } from '../utils/chatInputMcpPrompts';

type PromptSelection = {
  id: number;
  agentId: string;
  choice: ChatInputMcpPrompt;
  controller: AbortController;
};

function promptKey(choice: ChatInputMcpPrompt): string {
  return `${choice.serverId}:${choice.prompt.key}`;
}

/** The same compact picker as Plugins; its rows are already-discovered local metadata. */
export function ChatInputPromptPopover({
  agentId,
  children,
  onClose,
  open,
  prompts,
  returnFocusRef,
}: {
  agentId?: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  prompts: readonly ChatInputMcpPrompt[];
  returnFocusRef?: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const mcp = useBackendModule('mcp');
  const files = useBackendModule('file');
  const conversation = useMcpAppConversation();
  const { runInputReplacement } = useComposerPresentationActions();
  const initialFocusRef = useRef<View>(null);
  const selected = useRef<PromptSelection | undefined>(undefined);
  const nextSelectionId = useRef(0);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  const [argumentRequest, setArgumentRequest] = useState<PromptSelection>();
  const [isArgumentSheetOpen, setIsArgumentSheetOpen] = useState(false);
  // A prompt without parameters resolves while the menu stays open, so its row shows progress.
  const [loading, setLoading] = useState<PromptSelection>();
  const cancelSelection = useCallback(() => {
    selected.current?.controller.abort();
    selected.current = undefined;
    setLoading(undefined);
    setIsArgumentSheetOpen(false);
  }, []);

  useEffect(() => cancelSelection, [agentId, cancelSelection]);
  useFocusEffect(
    useCallback(
      () => () => {
        cancelSelection();
        setShouldRestoreFocus(false);
        onClose();
      },
      [cancelSelection, onClose, setShouldRestoreFocus],
    ),
  );

  function select(choice: ChatInputMcpPrompt) {
    if (
      !open ||
      !agentId ||
      (selected.current && promptKey(selected.current.choice) === promptKey(choice))
    )
      return;
    // A different choice supersedes the one still resolving.
    selected.current?.controller.abort();
    const selection: PromptSelection = {
      id: nextSelectionId.current++,
      agentId,
      choice,
      controller: new AbortController(),
    };
    selected.current = selection;
    if (choice.prompt.arguments.length > 0) {
      setLoading(undefined);
      setShouldRestoreFocus(false);
      onClose();
      return;
    }
    setLoading(selection);
    setShouldRestoreFocus(true);
    void apply(selection, {})
      .then(() => {
        if (!selection.controller.signal.aborted) onClose();
      })
      .catch(() => failed(selection))
      .finally(() => setLoading((current) => (current === selection ? undefined : current)));
  }

  function failed(selection: PromptSelection) {
    if (!selection.controller.signal.aborted)
      toast.show({ label: t('mcp.content.failed'), variant: 'danger' });
    if (selected.current === selection) selected.current = undefined;
  }

  async function apply(selection: PromptSelection, args: Record<string, string>) {
    const { agentId: selectedAgentId, choice, controller } = selection;
    controller.signal.throwIfAborted();
    const content = await mcp.readPrompt(
      selectedAgentId,
      choice.serverId,
      choice.prompt.key,
      args,
      controller.signal,
    );
    controller.signal.throwIfAborted();
    if (!conversation) throw new Error('The composer is unavailable.');
    await addMcpContentToDraft(content, files, conversation, controller.signal);
    if (selected.current === selection) {
      selected.current = undefined;
      setIsArgumentSheetOpen(false);
    }
  }

  function openArgumentsAfterClose() {
    const selection = selected.current;
    if (
      !selection ||
      selection.controller.signal.aborted ||
      selection.choice.prompt.arguments.length === 0
    )
      return;
    void runInputReplacement(() => {
      if (selection.controller.signal.aborted) return;
      setArgumentRequest(selection);
      setIsArgumentSheetOpen(true);
    }).catch(() => failed(selection));
  }

  async function submitArguments(answers: QuestionFormAnswer[]): Promise<'applied'> {
    if (!argumentRequest || selected.current !== argumentRequest)
      throw new Error('This prompt is no longer selected.');
    const args = Object.fromEntries(
      answers.filter((answer) => !answer.skipped).map((answer) => [answer.questionId, answer.text]),
    );
    await apply(argumentRequest, args);
    return 'applied';
  }

  const argumentQuestions: QuestionFormQuestion[] =
    argumentRequest?.choice.prompt.arguments.map((argument) => ({
      id: argument.name,
      question: t('mcp.prompts.argumentTitle', { name: argument.name }),
      description: argument.description,
      required: argument.required,
      selection: 'single',
      options: [],
      input: { label: argument.name, maxLength: 64 * 1024, preserveWhitespace: true },
    })) ?? [];

  const loadingKey = loading && promptKey(loading.choice);
  const content = (
    <ScrollView
      className="grow-0 shrink"
      contentContainerClassName="gap-0.5 p-2"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      {prompts.map((choice, index) => (
        <Pressable
          accessibilityLabel={choice.prompt.title}
          accessibilityHint={choice.serverName}
          accessibilityRole="button"
          accessibilityState={{ busy: loadingKey === promptKey(choice) }}
          className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active"
          key={promptKey(choice)}
          onPress={() => select(choice)}
          ref={index === 0 ? initialFocusRef : undefined}
          testID={`chat-prompt-${choice.serverId}-${choice.prompt.key}`}
        >
          <MessageSquareTextIcon className="size-5 text-foreground" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-base text-foreground">{choice.prompt.title}</Text>
            <Text className="text-xs text-muted-foreground">{choice.serverName}</Text>
          </View>
          {loadingKey === promptKey(choice) ? <Spinner size="sm" /> : null}
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <>
      <Composer.Popover
        accessibilityLabel={t('plugins.mcp.title')}
        content={content}
        initialFocusRef={initialFocusRef}
        maxHeight={320}
        maxWidth={280}
        onClose={(reason) => {
          // Dismissing the menu abandons a prompt still resolving in it.
          if (loading) cancelSelection();
          setShouldRestoreFocus(reason !== 'anchor');
          onClose();
        }}
        onClosed={openArgumentsAfterClose}
        open={open}
        returnFocusRef={shouldRestoreFocus ? returnFocusRef : undefined}
        testID="chat-prompt-popover"
      >
        {children}
      </Composer.Popover>
      {argumentRequest ? (
        <UserQuestionSheet
          key={argumentRequest.id}
          open={isArgumentSheetOpen && argumentRequest.agentId === agentId}
          questions={argumentQuestions}
          allowSkip={false}
          disabled={!isArgumentSheetOpen || argumentRequest.controller.signal.aborted}
          onClose={cancelSelection}
          onRespond={submitArguments}
        />
      ) : null}
    </>
  );
}
