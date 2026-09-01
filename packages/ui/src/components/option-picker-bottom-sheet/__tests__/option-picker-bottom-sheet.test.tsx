import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { OptionPickerBottomSheet } from '../option-picker-bottom-sheet';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('@cherrystudio/app-icons/icons/check', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockCheckIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'option-check' });
  };
});

jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => {
  const { View } = require('react-native');
  return View;
});

jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => {
  const { View } = require('react-native');
  return View;
});

jest.mock('../../bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheet: function MockBottomSheet({ children, ...props }: { children: ReactNode }) {
      return React.createElement(View, { ...props, testID: 'option-picker-sheet' }, children);
    },
  };
});

describe('OptionPickerBottomSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('changes a new value and closes after selection', () => {
    const onClose = jest.fn();
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <OptionPickerBottomSheet
          helperText="Used for future chats."
          onClose={onClose}
          onValueChange={onValueChange}
          open
          options={[
            { label: 'Automatic', value: 'auto' },
            {
              description: 'Ask before every tool call.',
              label: 'Always ask',
              leading: <View testID="option-leading" />,
              value: 'ask',
            },
          ]}
          selectedValue="auto"
          size="compact"
          title="Tool approval"
        />,
      );
    });

    const rows = renderer!.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'radio' && typeof node.props.className === 'string',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].props.accessibilityState.checked).toBe(true);
    expect(renderer!.root.findByProps({ testID: 'option-check' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'option-leading' })).toBeDefined();
    expect(renderer!.root.findByType(ScrollView).props.contentContainerClassName).toBe('pt-2');
    expect(renderer!.root.findAllByProps({ testID: 'section-separator' })).toHaveLength(0);
    expect(renderer!.root.findAllByType(Text).map((node) => node.props.children)).toEqual(
      expect.arrayContaining(['Ask before every tool call.', 'Used for future chats.']),
    );

    act(() => rows[1].props.onPress());

    expect(onValueChange).toHaveBeenCalledWith('ask');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('only closes when the selected value is pressed again', () => {
    const onClose = jest.fn();
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <OptionPickerBottomSheet
          onClose={onClose}
          onValueChange={onValueChange}
          open
          options={[{ label: 'System', value: 'system' }]}
          selectedValue="system"
          size="compact"
          title="Language"
        />,
      );
    });

    const selectedRow = renderer!.root.find(
      (node) =>
        node.props.accessibilityRole === 'radio' && typeof node.props.className === 'string',
    );
    act(() => selectedRow.props.onPress());

    expect(onValueChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
