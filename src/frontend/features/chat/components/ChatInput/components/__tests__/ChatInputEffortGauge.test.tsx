import type { ReactNode } from 'react';
import { Text, type PressableProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputEffortGauge } from '../ChatInputEffortGauge';

jest.mock('@cherrystudio/app-icons/icons/gauge', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable } = require('react-native');
  const Control = ({ icon, children, ...props }: PressableProps & { icon?: ReactNode }) => (
    <Pressable {...props}>
      {icon}
      {children}
    </Pressable>
  );
  return { Composer: { Action: Control, Pill: Control } };
});

const onPress = jest.fn();
let renderer: ReactTestRenderer | undefined;

async function render(label: string) {
  await act(async () => {
    const tree = (
      <ChatInputEffortGauge
        accessibilityLabel={`Reasoning effort: ${label}`}
        label={label}
        onPress={onPress}
        stopCount={4}
        valueIndex={2}
      />
    );
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
}

function queryByText(text: string) {
  return renderer?.root.findAllByType(Text).find((node) => node.props.children === text) ?? null;
}

function getByText(text: string) {
  const node = queryByText(text);
  if (!node) throw new Error(`Unable to find an element with text: ${text}`);
  return node;
}

function getByTestId(testID: string) {
  return renderer?.root.findByProps({ testID });
}

function getByLabelText(accessibilityLabel: string) {
  return renderer?.root
    .findAll((node) => typeof node.type === 'string')
    .find((node) => node.props.accessibilityLabel === accessibilityLabel);
}

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

it('renders the active level text next to the gauge', async () => {
  await render('High');
  expect(getByText('High')).toBeTruthy();
  expect(getByTestId('chat-input-effort-gauge')).toBeTruthy();
});

it('keeps the accessibility label it is given', async () => {
  await render('High');
  expect(getByLabelText('Reasoning effort: High')).toBeTruthy();
});

it('updates the level without remounting', async () => {
  await render('High');
  expect(getByText('High')).toBeTruthy();

  await render('Max');
  expect(getByText('Max')).toBeTruthy();
  expect(queryByText('High')).toBeNull();
});

it('renders a longer label unchanged', async () => {
  await render('Extra high');
  expect(getByText('Extra high')).toBeTruthy();
});
