import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Section } from '../section';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('@cherrystudio/app-icons/icons/check', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => React.createElement(View, { ...props, testID: 'section-radio-check' });
});
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => React.createElement(View, { ...props, testID: 'section-chevron' });
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
          node.props.className.includes('bg-grouped-surface'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('min-h-10 flex-row items-center gap-3 px-4 py-3'),
      ).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findByProps({ children: 'General' }).props.className).toContain(
      'text-foreground',
    );
    expect(
      tree.root.findByProps({ children: 'Changes apply immediately.' }).props.className,
    ).toContain('mt-2');
  });

  // A trailing value is usually a variable-length string, so the slot that holds
  // it is the side that gives: it shrinks, and past a share of the row it stops
  // growing so the label keeps a column to itself. Callers used to cap it one by
  // one, and the ones that forgot rendered their label a character per line.
  test('caps trailing content and lets it shrink rather than squeeze the label', () => {
    const tree = render(
      <Section>
        <Section.Item
          label="Model"
          trailing={<Text testID="row-value">a-very-long-model-id</Text>}
        />
      </Section>,
    );

    const slots = tree.root.findAll(
      (node) =>
        node.type === View &&
        typeof node.props.className === 'string' &&
        node.props.className.includes('items-center justify-center') &&
        node.findAllByProps({ testID: 'row-value' }).length > 0,
    );

    expect(slots).toHaveLength(1);
    expect(slots[0].props.className).toContain('min-w-0');
    expect(slots[0].props.className).toContain('max-w-[62%]');
    expect(slots[0].props.className).toContain('shrink');
    expect(slots[0].props.className).not.toContain('shrink-0');
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
        node.props.className.includes('bg-grouped-surface'),
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
    expect(label.props.className).toContain('text-destructive');
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

  test('composes radio semantics, selection indicator, and grouped-row behavior', () => {
    const onPress = jest.fn();
    const tree = render(
      <Section>
        <Section.RadioItem label="Automatic" onPress={jest.fn()} selected={false} />
        <Section.RadioItem
          disabled
          label="Always"
          leading={<View testID="radio-leading" />}
          onPress={onPress}
          selected
          testID="selected-radio"
        />
      </Section>,
    );
    const row = tree.root.find(
      (node) =>
        node.props.testID === 'selected-radio' &&
        node.props.accessibilityRole === 'radio' &&
        typeof node.props.className === 'string',
    );

    expect(row.props.accessibilityState).toEqual({ checked: true, disabled: true });
    expect(row.props.disabled).toBe(true);
    expect(
      tree.root.findAll(
        (node) => node.type === View && node.props.testID === 'section-radio-check',
      ),
    ).toHaveLength(1);
    expect(tree.root.findAllByProps({ testID: 'section-chevron' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'section-separator' }).props.className).toContain(
      'ml-11',
    );
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
        node.props.className.includes('px-4 py-3'),
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
