import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Section } from '../section';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('@cherrystudio/app-icons/icons/check', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return function MockCheckIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'section-radio-check' });
  };
});
jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return function MockChevronDownIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'section-select-chevron' });
  };
});
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return function MockChevronRightIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'section-chevron' });
  };
});

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  function Switch(props: object) {
    return React.createElement(MockView, { ...props, mockComponent: 'hero-switch' });
  }

  Switch.Thumb = function SwitchThumb(props: object) {
    return React.createElement(MockView, { ...props, mockComponent: 'hero-switch-thumb' });
  };

  return { Switch };
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
          typeof node.props.className === 'string' && node.props.className.includes('bg-card'),
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

  test('renders plain rows without a grouped surface or separators', () => {
    const tree = render(
      <Section footer="Choose one option." variant="plain">
        <Section.RadioItem label="Automatic" onPress={jest.fn()} selected />
        <Section.RadioItem label="Manual" onPress={jest.fn()} selected={false} />
      </Section>,
    );

    expect(
      tree.root.findAll((node) => node.type === View && node.props.testID === 'section-separator'),
    ).toHaveLength(0);
    expect(
      tree.root.find(
        (node) =>
          node.type === View &&
          typeof node.props.className === 'string' &&
          node.props.className.includes('bg-transparent'),
      ).props.className,
    ).not.toContain('bg-card');
    expect(tree.root.findByProps({ children: 'Choose one option.' }).props.className).toContain(
      'px-4',
    );
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

    expect(header.props.className).toContain('min-h-10 flex-row items-center gap-3');
    expect(header.props.className).not.toContain('px-3');
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
        node.props.className.includes('bg-card'),
    );

    expect(groupedCard.findAllByProps({ testID: 'section-header' })).toHaveLength(0);
    expect(
      tree.root.find(
        (node) =>
          node.type === View &&
          node.props.className === 'px-3' &&
          node.findAllByProps({ testID: 'section-header' }).length > 0,
      ),
    ).toBeDefined();
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

  test.each([
    { className: 'py-2', density: 'compact' },
    { className: 'py-3', density: 'default' },
    { className: 'py-4', density: 'comfortable' },
  ] as const)('renders $density item density', ({ className, density }) => {
    const tree = render(
      <Section>
        <Section.Item density={density} label="Density" testID="density-row" />
      </Section>,
    );

    expect(tree.root.findByProps({ testID: 'density-row' }).props.className).toContain(className);
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

  test('composes a current value and down indicator for selection rows', () => {
    const onPress = jest.fn();
    const tree = render(
      <Section>
        <Section.SelectItem
          label="Language"
          leading={<View testID="language-icon" />}
          onPress={onPress}
          testID="language-row"
          value="English"
          valueLeading={<View testID="language-value-icon" />}
        />
      </Section>,
    );
    const row = tree.root.find(
      (node) => node.props.testID === 'language-row' && node.props.accessibilityRole === 'button',
    );
    const value = tree.root.findByProps({ children: 'English' });

    expect(row.props.accessibilityLabel).toBe('Language');
    expect(value.props.className).toContain('text-right text-base text-foreground');
    expect(tree.root.findByProps({ testID: 'language-value-icon' })).toBeDefined();
    expect(
      tree.root.findAll(
        (node) => node.type === View && node.props.testID === 'section-select-chevron',
      ),
    ).toHaveLength(1);
    expect(tree.root.findAllByProps({ testID: 'section-chevron' })).toHaveLength(0);

    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('makes a switch row the only interaction and accessibility owner', () => {
    const onValueChange = jest.fn();
    const tree = render(
      <Section>
        <Section.SwitchItem
          description="Allow background updates"
          label="Notifications"
          leading={<View testID="switch-leading" />}
          onValueChange={onValueChange}
          testID="switch-row"
          value
        />
        <Section.SwitchItem
          disabled
          label="Disabled setting"
          onValueChange={jest.fn()}
          value={false}
        />
      </Section>,
    );
    const row = tree.root.find(
      (node) =>
        node.props.testID === 'switch-row' &&
        node.props.accessibilityRole === 'switch' &&
        typeof node.props.className === 'string',
    );
    const indicators = tree.root.findAllByProps({ mockComponent: 'hero-switch' });
    const indicator = indicators[0];
    const disabledRow = tree.root.find(
      (node) =>
        node.props.accessibilityLabel === 'Disabled setting' &&
        node.props.accessibilityRole === 'switch' &&
        typeof node.props.className === 'string',
    );

    expect(row.props.accessibilityLabel).toBe('Notifications');
    expect(row.props.accessibilityState).toEqual({ checked: true, disabled: undefined });
    expect(indicator?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      isDisabled: false,
      isSelected: true,
      pointerEvents: 'none',
    });
    expect(indicator?.props.onSelectedChange).toBeUndefined();
    expect(disabledRow.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(indicators[1]?.props.isDisabled).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'section-chevron' })).toHaveLength(0);
    expect(tree.root.findByProps({ children: 'Allow background updates' })).toBeDefined();
    const separator = () => tree.root.findByProps({ testID: 'section-separator' });
    expect(separator().props.className).toContain('ml-11');

    act(() => row.props.onPressIn({}));
    expect(separator().props.className).toContain('opacity-0');
    act(() => row.props.onPressOut({}));
    expect(separator().props.className).not.toContain('opacity-0');

    act(() => row.props.onPress());
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(false);
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
