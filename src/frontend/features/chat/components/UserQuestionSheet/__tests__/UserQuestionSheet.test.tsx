import { BottomSheet } from '@cherrystudio/ui/components';
import type { PropsWithChildren, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { UserQuestionSheet } from '../UserQuestionSheet';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');
  return {
    BottomSheet: ({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) =>
      createElement(View, null, children, footer),
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
  expect(sheet.props.titleNumberOfLines).toBe(0);
});
