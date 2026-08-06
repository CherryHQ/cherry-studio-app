import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Tabs } from '../tabs.android';

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
});
