import type { PropsWithChildren, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { EditUserMessageSheet } from '../EditUserMessageSheet';

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const { Pressable, TextInput, View } = jest.requireActual('react-native');
  return {
    BottomSheet: ({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) =>
      createElement(View, null, children, footer),
    Button: (props: object) => createElement(Pressable, props),
    Input: TextInput,
  };
});
const mockDismissInput = jest.fn();
jest.mock('@/frontend/components/Composer', () => ({
  useComposerPresentationActions: () => ({ dismissInput: mockDismissInput }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

function renderSheet(initialText: string, onSubmit: (text: string) => Promise<boolean>) {
  act(() => {
    renderer = create(
      <EditUserMessageSheet initialText={initialText} onClose={jest.fn()} onSubmit={onSubmit} />,
    );
  });
  const input = () => renderer!.root.findByProps({ testID: 'edit-user-message-input' });
  const send = () => renderer!.root.findByProps({ testID: 'edit-user-message-send' });
  return { input, send };
}

test('starts from the sent text and sends the edited text', async () => {
  const onSubmit = jest.fn(async (_text: string) => true);
  const { input, send } = renderSheet('Original question', onSubmit);

  // The sheet covers the chat composer, whose editing session ends with it.
  expect(mockDismissInput).toHaveBeenCalled();
  expect(input().props.value).toBe('Original question');

  act(() => input().props.onChangeText('Edited question'));
  await act(async () => {
    send().props.onPress();
    await Promise.resolve();
  });

  expect(onSubmit).toHaveBeenCalledWith('Edited question');
});

test('does not offer to send text without content', () => {
  const onSubmit = jest.fn(async (_text: string) => true);
  const { send } = renderSheet('   ', onSubmit);

  expect(send().props.disabled).toBe(true);
});

test('keeps the text and re-enables sending when the edit is not applied', async () => {
  let resolve!: (applied: boolean) => void;
  const onSubmit = jest.fn(
    (_text: string) =>
      new Promise<boolean>((next) => {
        resolve = next;
      }),
  );
  const { input, send } = renderSheet('Original question', onSubmit);

  act(() => input().props.onChangeText('Edited question'));
  act(() => send().props.onPress());
  expect(send().props.disabled).toBe(true);

  await act(async () => {
    resolve(false);
    await Promise.resolve();
  });

  expect(send().props.disabled).toBe(false);
  expect(input().props.value).toBe('Edited question');
});
