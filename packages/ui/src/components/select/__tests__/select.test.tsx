import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Select } from '../select';

jest.mock('heroui-native/select', () => {
  const React = require('react');
  const { View } = require('react-native');

  function Root(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'select' });
  }

  Root.Trigger = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'trigger' });
  Root.Value = (props: object) => React.createElement(View, { ...props, mockComponent: 'value' });
  Root.TriggerIndicator = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'trigger-indicator' });
  Root.Portal = (props: object) => React.createElement(View, props);
  Root.Overlay = (props: object) => React.createElement(View, props);
  Root.Content = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'content' });
  Root.Item = (props: object) => React.createElement(View, { ...props, mockComponent: 'item' });
  Root.ItemLabel = (props: object) => React.createElement(View, props);
  Root.ItemIndicator = (props: object) => React.createElement(View, props);

  return { Select: Root };
});

describe('Select', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('preserves the HeroUI select anatomy and value shape', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Select onValueChange={onValueChange} value={{ label: 'OpenAI', value: 'openai' }}>
          <Select.Trigger accessibilityLabel="Provider">
            <Select.Value placeholder="Select a provider" />
            <Select.TriggerIndicator />
          </Select.Trigger>
          <Select.Portal>
            <Select.Overlay />
            <Select.Content presentation="popover" width="trigger">
              <Select.Item label="Not set" value="not-set">
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
              <Select.Item label="OpenAI" value="openai">
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
              <Select.Item label="Anthropic" value="anthropic">
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
            </Select.Content>
          </Select.Portal>
        </Select>,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'select' });
    const trigger = renderer!.root.findByProps({ mockComponent: 'trigger' });
    const content = renderer!.root.findByProps({ mockComponent: 'content' });
    const items = renderer!.root
      .findAllByProps({ mockComponent: 'item' })
      .filter((item) => item.type === View);

    expect(root.props.isDisabled).toBeUndefined();
    expect(root.props.value).toEqual({ label: 'OpenAI', value: 'openai' });
    expect(trigger.props.accessibilityLabel).toBe('Provider');
    expect(content.props.presentation).toBe('popover');
    expect(content.props.width).toBe('trigger');
    expect(items.map((item) => [item.props.label, item.props.value])).toEqual([
      ['Not set', 'not-set'],
      ['OpenAI', 'openai'],
      ['Anthropic', 'anthropic'],
    ]);

    act(() => root.props.onValueChange({ label: 'Anthropic', value: 'anthropic' }));
    expect(onValueChange).toHaveBeenCalledWith({ label: 'Anthropic', value: 'anthropic' });
  });

  test('forwards disabled state, style, and testID', () => {
    const style = { marginTop: 8 };

    act(() => {
      renderer = create(
        <Select
          isDisabled
          onValueChange={jest.fn()}
          style={style}
          value={{ label: 'OpenAI', value: 'openai' }}
        >
          <Select.Trigger accessibilityLabel="Provider" testID="provider-select">
            <Select.Value placeholder="" />
          </Select.Trigger>
        </Select>,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'select' });
    const trigger = renderer!.root.findByProps({ mockComponent: 'trigger' });
    const value = renderer!.root.findByProps({ mockComponent: 'value' });

    expect(root.props.isDisabled).toBe(true);
    expect(root.props.style).toBe(style);
    expect(root.props.value).toEqual({ label: 'OpenAI', value: 'openai' });
    expect(trigger.props.testID).toBe('provider-select');
    expect(value.props.placeholder).toBe('');
  });
});
