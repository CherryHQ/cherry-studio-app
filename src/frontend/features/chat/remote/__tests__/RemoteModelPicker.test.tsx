import { BottomSheet, Button } from '@cherrystudio/ui/components';
import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentRef } from '@/frontend/appShell/conversation';
import { useRemoteModels } from '@/frontend/appShell/conversation/remote';
import { ModelPickerList, ModelPickerSearch } from '@/frontend/components/ModelPicker';

import { RemoteModelPicker } from '../RemoteModelPicker';

jest.mock('@/frontend/appShell/conversation/remote', () => ({ useRemoteModels: jest.fn() }));
jest.mock('@/frontend/components/ModelPicker', () => ({
  ...jest.requireActual('@/frontend/components/ModelPicker/components/ModelPickerSheet'),
  ModelPickerList: jest.fn(() => null),
}));
jest.mock('@/frontend/components/EmptyIllustration', () => ({ EmptyIllustration: () => null }));
jest.mock('@cherrystudio/ui/components', () => ({
  BottomSheet: ({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <>
        {children}
        {footer}
      </>
    ) : null,
  Button: ({ onPress, children }: { onPress(): void; children: ReactNode }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <Text accessibilityRole="button" onPress={onPress}>
        {children}
      </Text>
    );
  },
  SearchField: () => null,
  ContentState: { Empty: () => null, Loading: () => null, Error: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const first = { providerId: 'a', providerName: 'First', modelId: 'chat', name: 'Chat' };
const second = { ...first, providerId: 'b', providerName: 'Second' };
const agent = 'desktop-agent' as AgentRef;
let screen: ReactTestRenderer;
const select = jest.fn();
const fetchNextPage = jest.fn();
function render(props: Partial<ComponentProps<typeof RemoteModelPicker>> = {}) {
  const element = (
    <RemoteModelPicker agent={agent} open onClose={jest.fn()} onSelect={select} {...props} />
  );
  act(() => {
    screen = create(element);
  });
}
function list() {
  return screen.root.findByType(ModelPickerList).props as Extract<
    ComponentProps<typeof ModelPickerList>,
    { onChoose(key: string): void }
  >;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRemoteModels).mockReturnValue({
    data: { pages: [{ items: [first] }, { items: [first, second] }] },
    isSuccess: true,
    isEnabled: true,
    hasNextPage: true,
    fetchNextPage,
  } as unknown as ReturnType<typeof useRemoteModels>);
});
afterEach(() => act(() => screen.unmount()));

test('uses desktop identity across providers and overlapping pages, and applies a single choice immediately', () => {
  render({ selected: second });
  const { listItems, selectedModelId, onChoose, onEndReached } = list();
  const choices = listItems.filter((item) => item.type === 'choice');
  expect(choices.map((item) => item.name)).toEqual([
    'remoteAgent.followAgentModel',
    'Chat',
    'Chat',
  ]);
  expect(listItems.filter((item) => item.type === 'groupHeader').map((item) => item.title)).toEqual(
    ['First', 'Second'],
  );
  expect(selectedModelId).toBe(choices[2].key);
  act(() => onChoose(choices[2].key));
  expect(select).toHaveBeenLastCalledWith(second);
  act(() => onChoose(choices[0].key));
  expect(select).toHaveBeenLastCalledWith(undefined);
  act(() => onEndReached?.());
  expect(fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  act(() => screen.root.findByType(ModelPickerSearch).props.onChange('Second'));
  expect(useRemoteModels).toHaveBeenLastCalledWith(agent, 'Second', true);
  expect(list().listItems.some((item) => item.key === choices[0].key)).toBe(false);
});

test('recovery keeps selection provisional until Resend and drops it on close', () => {
  const view = (open: boolean) => (
    <RemoteModelPicker
      agent={agent}
      open={open}
      onClose={close}
      onSelect={select}
      confirmLabel="Resend"
    />
  );
  const close = () => screen.update(view(false));
  act(() => {
    screen = create(view(true));
  });
  const key = list().listItems.find(
    (item) => item.type === 'choice' && item.model?.providerId === 'b',
  )!.key;
  act(() => list().onChoose(key));
  expect(select).not.toHaveBeenCalled();
  act(() => screen.root.findByType(BottomSheet).props.onClose());
  expect(useRemoteModels).toHaveBeenLastCalledWith(agent, '', false);
  expect(select).not.toHaveBeenCalled();
  act(() => screen.update(view(true)));
  expect(list().selectedModelId).not.toBe(key);
  act(() => list().onChoose(key));
  act(() => screen.root.findByType(Button).props.onPress());
  expect(select).toHaveBeenCalledWith(second);
});
