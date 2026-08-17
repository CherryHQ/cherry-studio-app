import type { AssistantMessageActions, MessageListProps, MessagePresentationItem } from './types';

const assistantActions = {
  isRegenerateDisabled: false,
  onCopy: () => undefined,
  onRegenerate: () => undefined,
} satisfies AssistantMessageActions;

const commonProps = {
  contentBottomInset: 0,
  contentTopInset: 0,
  keyboardOffset: 0,
  messages: [],
} satisfies MessageListProps;

const renderAssistantMessage = (message: MessagePresentationItem) => message.id;

const defaultModeProps: MessageListProps = { ...commonProps, assistantActions };
const customModeProps: MessageListProps = { ...commonProps, renderAssistantMessage };

// @ts-expect-error Default assistant actions and a custom assistant renderer are exclusive modes.
const conflictingModeProps: MessageListProps = {
  ...commonProps,
  assistantActions,
  renderAssistantMessage,
};

void [defaultModeProps, customModeProps, conflictingModeProps];
