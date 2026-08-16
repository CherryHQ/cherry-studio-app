import type { AssistantMessageActions, MessageListProps, MessagePresentationItem } from '../types';

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

const createConflictingModeProps = () => {
  // @ts-expect-error Default assistant actions and a custom assistant renderer are exclusive modes.
  const props: MessageListProps = {
    ...commonProps,
    assistantActions,
    renderAssistantMessage,
  };

  return props;
};

/**
 * A type-level contract, not a render test. These values keep every supported
 * mode checked by `tsc`; the conflicting factory is never called, so its
 * `@ts-expect-error` becomes an error if the exclusivity contract is widened.
 */
describe('MessageListProps', () => {
  test('keeps default and custom assistant rendering modes exclusive', () => {
    expect([commonProps, defaultModeProps, customModeProps]).toHaveLength(3);
    expect(createConflictingModeProps).toBeInstanceOf(Function);
  });
});
