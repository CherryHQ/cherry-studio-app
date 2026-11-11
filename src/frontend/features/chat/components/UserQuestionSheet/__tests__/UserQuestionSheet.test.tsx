import { BottomSheet, Button, Input } from '@cherrystudio/ui/components';
import type { PropsWithChildren, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { UserQuestionSheet } from '../UserQuestionSheet';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');
  return {
    BottomSheet: ({
      children,
      footer,
      headerAction,
    }: PropsWithChildren<{ footer: ReactNode; headerAction?: ReactNode }>) =>
      createElement(View, null, headerAction, children, footer),
    Button: Object.assign((props: object) => createElement(Pressable, props), { Label: Text }),
    Input: TextInput,
    SelectionIndicator: () => null,
  };
});
const mockDismissInput = jest.fn();
jest.mock('@/frontend/components/Composer', () => ({
  useComposerPresentationActions: () => ({ dismissInput: mockDismissInput }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer?.unmount()));

test('titles the sheet with the complete question without a line limit', () => {
  const question = 'Describe the tradeoffs between the available deployment options. '.repeat(4);
  act(() => {
    renderer = create(
      <UserQuestionSheet
        open
        questions={[{ id: 'deployment', question, selection: 'single', options: [] }]}
        allowSkip
        disabled={false}
        onRespond={async () => 'applied'}
      />,
    );
  });
  const sheet = renderer.root.findByType(BottomSheet);
  expect(sheet.props.title).toBe(question);
  expect(sheet.props.titleVariant).toBe('prompt');
});

test('browses questions from the header without skipping them', () => {
  const questions = [
    { id: 'first', question: 'First?', selection: 'single' as const, options: [] },
    { id: 'second', question: 'Second?', selection: 'single' as const, options: [] },
  ];
  act(() => {
    renderer = create(
      <UserQuestionSheet
        open
        questions={questions}
        allowSkip
        disabled={false}
        onRespond={async () => 'applied'}
      />,
    );
  });
  const title = () => renderer.root.findByType(BottomSheet).props.title;
  const arrow = (testID: string) => renderer.root.findAllByProps({ testID })[0];

  expect(arrow('user-question-previous').props.disabled).toBe(true);
  act(() => arrow('user-question-next').props.onPress());
  expect(title()).toBe('Second?');
  expect(arrow('user-question-next').props.disabled).toBe(true);
  act(() => arrow('user-question-previous').props.onPress());
  expect(title()).toBe('First?');
  expect(renderer.root.findAllByProps({ children: 'chat.question.skipped' })).toHaveLength(0);
});

test('retains both reviewed answers and submits them together from a multi-question form', async () => {
  const onRespond = jest.fn(async () => 'applied' as const);
  const questions = ['first', 'second'].map((id) => ({
    id,
    question: `Apply ${id}?`,
    selection: 'single' as const,
    options: [
      { id: 'adapt', label: 'Save' },
      { id: 'keep', label: 'Keep' },
    ],
    textChanges: [{ before: 'Old steps', after: 'New steps', reason: 'Use on mobile' }],
  }));
  act(() => {
    renderer = create(
      <UserQuestionSheet
        open
        questions={questions}
        allowSkip={false}
        disabled={false}
        onRespond={onRespond}
      />,
    );
  });
  const radio = (label: string) =>
    renderer.root.findAllByProps({ accessibilityRole: 'radio', accessibilityLabel: label })[0];
  const button = (testID: string) => renderer.root.findAllByProps({ testID })[0];

  expect(renderer.root.findAllByType(Input)).toHaveLength(1);
  act(() => radio('Save').props.onPress());
  expect(onRespond).not.toHaveBeenCalled();
  act(() => button('user-question-action').props.onPress());
  expect(renderer.root.findByType(BottomSheet).props.title).toBe('Apply second?');
  act(() => radio('Keep').props.onPress());
  expect(onRespond).not.toHaveBeenCalled();
  act(() => button('user-question-previous').props.onPress());
  expect(radio('Save').props.accessibilityState.checked).toBe(true);
  act(() => button('user-question-next').props.onPress());
  expect(radio('Keep').props.accessibilityState.checked).toBe(true);

  await act(async () => button('user-question-action').props.onPress());
  expect(onRespond).toHaveBeenCalledTimes(1);
  expect(onRespond).toHaveBeenCalledWith([
    { questionId: 'first', selectedOptionIds: ['adapt'], text: '', skipped: false },
    { questionId: 'second', selectedOptionIds: ['keep'], text: '', skipped: false },
  ]);
});

test.each(['adapt', 'keep'])(
  'submits %s from a footer button with no answer selection or extra submit',
  async (id) => {
    const onRespond = jest.fn(async () => 'applied' as const);
    act(() => {
      renderer = create(
        <UserQuestionSheet
          open
          allowSkip
          disabled={false}
          onRespond={onRespond}
          questions={[
            {
              id: 'skill-adaptation',
              question: 'Adjust this skill?',
              selection: 'single',
              options: [
                { id: 'adapt', label: 'Save and continue' },
                { id: 'keep', label: 'Keep unchanged' },
              ],
              textChanges: [{ before: 'Old steps', after: 'New steps', reason: 'Use on mobile' }],
            },
          ]}
        />,
      );
    });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'radio' })).toHaveLength(0);
    expect(renderer.root.findAllByType(Input)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'user-question-action' })).toHaveLength(0);
    const buttons = renderer.root.findAllByType(Button);
    expect(buttons.map((button) => button.props.testID)).toEqual([
      'user-question-decision-keep',
      'user-question-decision-adapt',
    ]);
    expect(buttons.every((button) => button.props.disabled === false)).toBe(true);
    const button = buttons.find(
      (button) => button.props.testID === `user-question-decision-${id}`,
    )!;
    await act(async () => button.props.onPress());
    expect(onRespond).toHaveBeenCalledWith([
      { questionId: 'skill-adaptation', selectedOptionIds: [id], text: '', skipped: false },
    ]);
  },
);
