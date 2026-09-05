import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SelectionIndicator } from '../selection-indicator';

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
    return React.createElement(View, { ...props, testID: 'selection-check' });
  };
});

describe('SelectionIndicator', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders selected feedback as a decorative child of its parent control', () => {
    act(() => {
      renderer = create(<SelectionIndicator selected testID="indicator" />);
    });

    const indicator = renderer!.root.find(
      (node) => node.type === View && node.props.testID === 'indicator',
    );

    expect(indicator.props.accessibilityElementsHidden).toBe(true);
    expect(indicator.props.importantForAccessibility).toBe('no');
    expect(indicator.props.className).toContain('bg-foreground');
    expect(renderer!.root.findByProps({ testID: 'selection-check' })).toBeDefined();
  });

  test('supports unselected overlay contrast and disabled feedback', () => {
    act(() => {
      renderer = create(<SelectionIndicator disabled selected={false} variant="overlay" />);
    });

    const indicator = renderer!.root.find(
      (node) => node.type === View && typeof node.props.className === 'string',
    );

    expect(indicator.props.className).toContain('border-2 border-border-strong');
    expect(indicator.props.className).toContain('bg-constant-black/30');
    expect(indicator.props.className).toContain('opacity-40');
    expect(renderer!.root.findAllByProps({ testID: 'selection-check' })).toHaveLength(0);
  });
});
