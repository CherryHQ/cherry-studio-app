import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Tabs } from '../tabs.android';
import type { TabsItemState } from '../tabs.types';

jest.mock('heroui-native/tabs', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');

  const component = (testID: string, Component = View) =>
    function MockComponent({ children, className, ...props }: MockComponentProps) {
      return React.createElement(
        Component,
        { ...props, sourceClassName: className, testID },
        children,
      );
    };

  const Root = Object.assign(
    function MockTabs({ children, className, ...props }: MockComponentProps) {
      return React.createElement(View, { ...props, sourceClassName: className }, children);
    },
    {
      Indicator: component('hero-tabs-indicator'),
      Label: component('hero-tabs-label', Text),
      List: component('hero-tabs-list'),
      Trigger: component('hero-tabs-trigger'),
    },
  );

  return { Tabs: Root };
});

type MockComponentProps = {
  children?: ReactNode;
  className?: string;
};

const items = [
  { label: 'Messages', testID: 'messages-tab', value: 'messages' },
  { disabled: true, label: 'Settings', testID: 'settings-tab', value: 'settings' },
] as const;

describe('Tabs.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps the data API to HeroUI Tabs', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Tabs
          items={items}
          onValueChange={onValueChange}
          style={{ width: 144 }}
          testID="account-tabs"
          value="messages"
        />,
      );
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    const root = renderer.root.findByProps({ testID: 'account-tabs' });
    const list = renderer.root.findByProps({ testID: 'hero-tabs-list' });
    const triggers = renderer.root.findAllByProps({ testID: 'hero-tabs-trigger' });
    const messagesTrigger = triggers.find((trigger) => trigger.props.value === 'messages');
    const settingsTrigger = triggers.find((trigger) => trigger.props.value === 'settings');

    expect(root.props.style).toEqual({ width: 144 });
    expect(list).toBeDefined();
    expect(messagesTrigger?.props).toMatchObject({
      accessibilityRole: 'tab',
      accessibilityState: { disabled: undefined, selected: true },
      isDisabled: undefined,
      value: 'messages',
    });
    expect(settingsTrigger?.props).toMatchObject({
      accessibilityState: { disabled: true, selected: false },
      isDisabled: true,
      value: 'settings',
    });
    expect(renderer.root.findAllByType(Text).map((label) => label.props.children)).toEqual([
      'Messages',
      'Settings',
    ]);
    expect(renderer.root.findAllByType(Text).map((label) => label.props.sourceClassName)).toEqual([
      'text-xs',
      'text-xs',
    ]);

    act(() => root.props.onValueChange('settings'));
    expect(onValueChange).toHaveBeenCalledWith('settings');
  });

  it('uses the same full-width layout without an explicit width', () => {
    act(() => {
      renderer = create(
        <Tabs items={items} onValueChange={jest.fn()} testID="default-tabs" value="messages" />,
      );
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    expect(renderer.root.findByProps({ testID: 'default-tabs' }).props.style).toBeUndefined();
    expect(renderer.root.findByProps({ testID: 'hero-tabs-list' })).toBeDefined();
  });

  it('sizes to its labels and aligns to the start when hugging', () => {
    act(() => {
      renderer = create(
        <Tabs
          items={items}
          layout="hug"
          onValueChange={jest.fn()}
          testID="hug-tabs"
          value="messages"
        />,
      );
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    const list = renderer.root.findByProps({ testID: 'hero-tabs-list' });
    const triggers = renderer.root.findAllByProps({ testID: 'hero-tabs-trigger' });

    // Last match is the innermost host view, the one the mock renamed
    // `className` on.
    expect(renderer.root.findAllByProps({ testID: 'hug-tabs' }).at(-1)?.props.sourceClassName).toBe(
      'gap-0 self-start',
    );
    expect(list.props.sourceClassName).toBe('h-[34px] self-start rounded-[17px]');
    // No `flex-1`: a hugging trigger is as wide as its own label.
    expect(
      items.map(
        (item) =>
          triggers.find((trigger) => trigger.props.value === item.value)?.props.sourceClassName,
      ),
    ).toEqual(['h-7 px-4 py-0', 'h-7 px-4 py-0']);
  });

  it('renders custom children with the current item state', () => {
    const customItems = [
      {
        children: ({ isDisabled, isSelected }: TabsItemState) => (
          <Text testID="custom-tab-content">
            {isSelected ? 'selected' : 'idle'}-{isDisabled ? 'disabled' : 'enabled'}
          </Text>
        ),
        disabled: true,
        label: 'Text',
        testID: 'text-tab',
        value: 'text',
      },
    ] as const;

    act(() => {
      renderer = create(<Tabs items={customItems} onValueChange={jest.fn()} value="text" />);
    });

    if (!renderer) {
      throw new Error('Tabs test renderer was not created.');
    }

    const trigger = renderer.root
      .findAllByProps({ testID: 'hero-tabs-trigger' })
      .find((node) => node.props.value === 'text');

    expect(trigger?.props.accessibilityLabel).toBe('Text');
    expect(renderer.root.findByProps({ testID: 'custom-tab-content' }).props.children).toEqual([
      'selected',
      '-',
      'disabled',
    ]);
  });
});
