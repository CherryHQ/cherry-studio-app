import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Section } from '../section';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('lucide-uniwind/png', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    ChevronRightIcon: (props: object) =>
      React.createElement(View, { ...props, testID: 'section-chevron' }),
  };
});

describe('Section', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(node: React.ReactElement) {
    act(() => {
      renderer = create(node);
    });

    return renderer!;
  }

  test('renders grouped rows with a title, footer, and inset separators', () => {
    const tree = render(
      <Section footer="Changes apply immediately." title="General">
        <Section.Item label="Appearance" />
        <Section.Item label="Language" />
        <Section.Item label="Storage" />
      </Section>,
    );

    expect(
      tree.root.findAll((node) => node.type === View && node.props.testID === 'section-separator'),
    ).toHaveLength(2);
    expect(tree.root.findAllByType(Text).map((node) => node.props.children)).toEqual(
      expect.arrayContaining([
        'General',
        'Appearance',
        'Language',
        'Storage',
        'Changes apply immediately.',
      ]),
    );
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('bg-vbg-gray-100'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('min-h-10 flex-row items-center gap-3 px-3 py-2'),
      ).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findByProps({ children: 'General' }).props.className).toContain(
      'text-foreground',
    );
    expect(
      tree.root.findByProps({ children: 'Changes apply immediately.' }).props.className,
    ).toContain('mt-2');
  });

  test('renders a standalone header with optional trailing content', () => {
    const tree = render(
      <Section.Header title="Models" testID="section-header">
        <Text testID="header-action">Add all</Text>
      </Section.Header>,
    );

    const header = tree.root.find(
      (node) => node.type === View && node.props.testID === 'section-header',
    );
    const title = tree.root.findByProps({ children: 'Models' });

    expect(header.props.className).toContain('flex-row items-center gap-3 px-3');
    expect(header.props.className).not.toContain('min-h-10');
    expect(title.props.className).toContain('text-base font-semibold text-foreground');
    expect(tree.root.findByProps({ testID: 'header-action' })).toBeDefined();
  });

  test('keeps a nested header outside the grouped card and separator rows', () => {
    const tree = render(
      <Section>
        <Section.Header title="Models" testID="section-header" />
        <Section.Item label="Model A" />
        <Section.Item label="Model B" />
      </Section>,
    );
    const groupedCard = tree.root.find(
      (node) =>
        node.type === View &&
        typeof node.props.className === 'string' &&
        node.props.className.includes('bg-vbg-gray-100'),
    );

    expect(groupedCard.findAllByProps({ testID: 'section-header' })).toHaveLength(0);
    expect(
      tree.root.findAll((node) => node.type === View && node.props.testID === 'section-separator'),
    ).toHaveLength(1);
  });

  test('uses Pressable only for interactive items and shows a default chevron', () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <Section>
        <Section.Item
          label="Models"
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          testID="interactive-row"
        />
        <Section.Item label="Version" testID="static-row" trailing={<Text>1.0</Text>} />
      </Section>,
    );

    const interactiveRow = tree.root.find(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.className === 'string' &&
        node.props.testID === 'interactive-row',
    );
    const staticRow = tree.root.find(
      (node) =>
        node.props.accessibilityRole === undefined &&
        typeof node.props.className === 'string' &&
        node.props.testID === 'static-row',
    );

    expect(interactiveRow.props.accessibilityLabel).toBe('Models');
    expect(tree.root.findAllByProps({ testID: 'section-chevron' }).length).toBeGreaterThan(0);
    expect(staticRow.props.accessibilityRole).toBeUndefined();
    const separators = () =>
      tree.root.findAll((node) => node.type === View && node.props.testID === 'section-separator');
    expect(separators()).toHaveLength(1);
    expect(separators()[0].props.className).not.toContain('opacity-0');

    act(() => interactiveRow.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => interactiveRow.props.onPressIn());
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(separators()).toHaveLength(1);
    expect(separators()[0].props.className).toContain('opacity-0');
    act(() => interactiveRow.props.onPressOut());
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(separators()).toHaveLength(1);
    expect(separators()[0].props.className).not.toContain('opacity-0');
  });

  test('supports disabled, destructive, description, and custom trailing content', () => {
    const onPress = jest.fn();
    const tree = render(
      <Section>
        <Section.Item
          description="This cannot be undone."
          destructive
          disabled
          label="Delete account"
          onPress={onPress}
          testID="delete-row"
          trailing={<Text testID="custom-trailing">Locked</Text>}
        />
      </Section>,
    );
    const row = tree.root.find(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.className === 'string' &&
        node.props.testID === 'delete-row',
    );
    const label = tree.root.findByProps({ children: 'Delete account' });

    expect(row.props.disabled).toBe(true);
    expect(row.props.className).toContain('opacity-40');
    expect(label.props.className).toContain('text-danger');
    expect(tree.root.findByProps({ testID: 'custom-trailing' })).toBeDefined();
    expect(
      tree.root.findAll((node) => node.type === View && node.props.testID === 'section-chevron'),
    ).toHaveLength(0);
  });

  test('supports non-button accessibility roles and states', () => {
    const tree = render(
      <Section>
        <Section.Item
          accessibilityRole="radio"
          accessibilityState={{ checked: true }}
          label="Always"
          onPress={jest.fn()}
          showChevron={false}
          testID="radio-row"
        />
      </Section>,
    );
    const row = tree.root.find(
      (node) =>
        node.props.testID === 'radio-row' &&
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.className === 'string',
    );

    expect(row.props.accessibilityState).toEqual({ checked: true, disabled: undefined });
  });

  test('supports custom row content while preserving item layout', () => {
    const tree = render(
      <Section>
        <Section.Item testID="custom-row">
          <View testID="custom-content" />
        </Section.Item>
      </Section>,
    );
    const row = tree.root.find(
      (node) =>
        node.props.testID === 'custom-row' &&
        typeof node.props.className === 'string' &&
        node.props.className.includes('px-3 py-2'),
    );
    const contentContainer = tree.root.find(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('min-w-0 flex-1') &&
        node.findAllByProps({ testID: 'custom-content' }).length > 0,
    );

    expect(row).toBeDefined();
    expect(contentContainer).toBeDefined();
  });
});
