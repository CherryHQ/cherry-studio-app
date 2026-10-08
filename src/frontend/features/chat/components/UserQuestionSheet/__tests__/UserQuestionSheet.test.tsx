import { BottomSheet } from '@cherrystudio/ui/components';
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
