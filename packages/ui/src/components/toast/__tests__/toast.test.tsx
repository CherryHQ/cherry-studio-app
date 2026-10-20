import { type ReactNode, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ToastProvider, useToast } from '../toast';

const mockHide = jest.fn();
const mockShow = jest.fn();
const mockHero = { show: mockShow, hide: mockHide };
jest.mock('heroui-native/toast', () => {
  const React = jest.requireActual('react');
  const Root = ({ children }: { children: ReactNode }) =>
    React.createElement('Toast', {}, children);
  return {
    Toast: Object.assign(Root, { Title: Root, Close: Root }),
    ToastProvider: Root,
    useToast: () => ({ toast: mockHero }),
  };
});
jest.mock('../../button', () => ({
  Button: (props: object) => jest.requireActual('react').createElement('Action', props),
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 16 }) }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));

let toast: ReturnType<typeof useToast>['toast'];
function Probe() {
  const current = useToast();
  useLayoutEffect(() => {
    toast = current.toast;
  });
  return null;
}

test('an action dismisses its own toast before invoking the selected action, without touching others', () => {
  const calls: string[] = [];
  const enable = jest.fn(() => calls.push('enable'));
  const ignore = jest.fn();
  mockShow.mockReturnValue('owned-hint');
  mockHide.mockImplementation((id: string) => calls.push(`hide:${id}`));
  let provider!: ReactTestRenderer;
  let content!: ReactTestRenderer;
  act(() => {
    provider = create(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
  });
  let id!: string;
  act(() => {
    id = toast.show({
      label: 'Hint',
      actions: [
        { label: 'Enable', onPress: enable },
        { label: 'Ignore', onPress: ignore },
      ],
    });
  });
  const Content = mockShow.mock.calls[0][0].component;
  act(() => {
    content = create(<Content id={id} hide={mockHide} />);
  });
  const actions = content.root.findAllByType('Action' as any);
  act(() => actions[0].props.onPress());
  expect(calls).toEqual(['hide:owned-hint', 'enable']);
  expect(ignore).not.toHaveBeenCalled();
  act(() => {
    provider.unmount();
    content.unmount();
  });
});
