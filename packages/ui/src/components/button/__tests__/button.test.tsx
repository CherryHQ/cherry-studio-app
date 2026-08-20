import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResolveClassNames } from 'uniwind';

import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '../button';

jest.mock('../../loading/spinner', () => {
  const React = require('react');
  const { View } = require('react-native');

  function Spinner(props: object) {
    return React.createElement(View, { ...props, testID: 'spinner' });
  }

  return { Spinner };
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn(() => ({ color: '#ffffff' })),
}));

describe('Button', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(
    children: ButtonProps['children'] = 'Continue',
    props: Partial<ButtonProps> = {},
  ) {
    act(() => {
      renderer = create(<Button {...props}>{children}</Button>);
    });

    if (!renderer) {
      throw new Error('Button renderer was not created.');
    }

    return renderer;
  }

  function findPressable(tree: ReactTestRenderer) {
    const pressable = tree.root.findAll((node) => node.props.accessibilityRole === 'button')[0];

    if (!pressable) {
      throw new Error('Pressable was not rendered.');
    }

    return pressable;
  }

  test('renders the default button and wraps primitive children in a label', () => {
    const tree = render('Continue');
    const pressable = findPressable(tree);
    const label = tree.root.findByType(Text);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.className).toEqual(expect.stringContaining('bg-foreground shadow-xs'));
    const rootClassNames = pressable.props.className.split(' ');
    expect(rootClassNames).toEqual(expect.arrayContaining(['gap-2', 'px-4', 'py-2.5']));
    expect(rootClassNames).not.toContain('h-10');
    expect(label.props.children).toBe('Continue');
    expect(label.props.className).toEqual(expect.stringContaining('text-background'));
    expect(label.props.className.split(' ')).toEqual(
      expect.arrayContaining(['min-w-0', 'shrink', 'text-base']),
    );
  });

  test('supports composed content through Button.Label', () => {
    const tree = render(
      <>
        <View testID="icon" />
        <Button.Label>Insert</Button.Label>
      </>,
      { size: 'lg', variant: 'outline' },
    );
    const label = tree.root.findByType(Text);

    expect(tree.root.findByProps({ testID: 'icon' })).toBeDefined();
    expect(label.props.className).toEqual(expect.stringContaining('text-foreground'));
    expect(label.props.className).toEqual(expect.stringContaining('text-lg'));
  });

  test.each<{
    iconClassName: string;
    labelClassName: string;
    rootClassNames: string[];
    size: ButtonSize;
  }>([
    {
      iconClassName: 'size-4',
      labelClassName: 'text-sm',
      rootClassNames: ['gap-1', 'px-2', 'py-1.5'],
      size: 'xs',
    },
    {
      iconClassName: 'size-4',
      labelClassName: 'text-sm',
      rootClassNames: ['gap-1.5', 'px-3', 'py-2'],
      size: 'sm',
    },
    {
      iconClassName: 'size-5',
      labelClassName: 'text-base',
      rootClassNames: ['gap-2', 'px-4', 'py-2.5'],
      size: 'default',
    },
    {
      iconClassName: 'size-6',
      labelClassName: 'text-lg',
      rootClassNames: ['gap-2.5', 'px-5', 'py-3'],
      size: 'lg',
    },
  ])('renders the $size size', ({ iconClassName, labelClassName, rootClassNames, size }) => {
    const tree = render('Add', { icon: <View testID="icon" />, size });
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassNameValue = tree.root.findByType(Text).props.className as string;
    const iconClassNameValue = tree.root.findByProps({ testID: 'icon' }).props.className as string;

    expect(rootClassName.split(' ')).toEqual(expect.arrayContaining(rootClassNames));
    expect(labelClassNameValue.split(' ')).toContain(labelClassName);
    expect(iconClassNameValue.split(' ')).toContain(iconClassName);
  });

  test('renders an icon with the label using the variant color', () => {
    const tree = render('Add', {
      icon: <View className="size-6 text-destructive" testID="icon" />,
      variant: 'outline',
    });
    const icon = tree.root.findByProps({ testID: 'icon' });
    const label = tree.root.findByType(Text);

    expect(label.props.children).toBe('Add');
    expect(icon.props.className.split(' ')).toEqual(
      expect.arrayContaining(['size-6', 'text-destructive']),
    );
    expect(icon.props.className).not.toContain('size-5');
    expect(icon.props.className).not.toContain('text-foreground');
  });

  test('keeps the xs visual density inside a usable touch target', () => {
    const tree = render(null, {
      accessibilityLabel: 'More',
      icon: <View testID="icon" />,
      size: 'xs',
    });

    expect(findPressable(tree).props.hitSlop).toBe(8);
  });

  test('uses content-driven square padding for an icon-only button', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
    });
    const pressable = findPressable(tree);
    const rootClassNames = pressable.props.className.split(' ');
    const iconClassNames = tree.root.findByProps({ testID: 'icon' }).props.className.split(' ');

    expect(pressable.props.accessibilityLabel).toBe('Add');
    expect(rootClassNames).toContain('p-2.5');
    expect(rootClassNames).not.toContain('px-4');
    expect(rootClassNames).not.toContain('py-2.5');
    expect(rootClassNames).not.toContain('h-10');
    expect(rootClassNames).not.toContain('w-10');
    expect(iconClassNames).toEqual(expect.arrayContaining(['size-5', 'text-background']));
  });

  test('applies large icon-only padding without fixed dimensions', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
      size: 'lg',
    });
    const rootClassNames = findPressable(tree).props.className.split(' ');

    expect(rootClassNames).toContain('p-3');
    expect(rootClassNames).not.toContain('px-5');
    expect(rootClassNames).not.toContain('py-3');
    expect(rootClassNames).not.toContain('h-12');
    expect(rootClassNames).not.toContain('w-12');
  });

  test.each<{
    labelClassName: string;
    rootClassNames: string[];
    variant: ButtonVariant;
  }>([
    {
      labelClassName: 'text-destructive-foreground',
      rootClassNames: ['bg-destructive', 'shadow-xs'],
      variant: 'destructive',
    },
    {
      labelClassName: 'text-foreground',
      rootClassNames: ['bg-transparent', 'shadow-none'],
      variant: 'ghost',
    },
    {
      labelClassName: 'text-foreground',
      rootClassNames: ['border', 'border-border', 'bg-transparent', 'shadow-none'],
      variant: 'outline',
    },
    {
      labelClassName: 'text-secondary-foreground',
      rootClassNames: ['border', 'border-border', 'bg-field', 'shadow-none'],
      variant: 'secondary',
    },
  ])('renders the $variant variant', ({ labelClassName, rootClassNames, variant }) => {
    const tree = render('Continue', { variant });
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassNameValue = tree.root.findByType(Text).props.className as string;

    expect(rootClassName.split(' ')).toEqual(expect.arrayContaining(rootClassNames));
    expect(labelClassNameValue.split(' ')).toContain(labelClassName);
    expect(useResolveClassNames).toHaveBeenLastCalledWith(labelClassName);
  });

  test('lets consumer class names override root and label defaults', () => {
    const tree = render(<Button.Label className="text-black">Delete</Button.Label>, {
      className: 'rounded-full bg-destructive px-6 py-4',
    });
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassName = tree.root.findByType(Text).props.className as string;

    expect(rootClassName.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-destructive', 'px-6', 'py-4']),
    );
    expect(rootClassName).not.toContain('px-4');
    expect(rootClassName).not.toContain('py-2.5');
    expect(rootClassName).not.toContain('rounded-xl');
    expect(rootClassName).not.toContain('bg-foreground');
    expect(labelClassName).toContain('text-black');
    expect(labelClassName).not.toContain('text-background');
  });

  test('disables the Pressable and exposes busy state while loading', () => {
    const tree = render('Save', {
      accessibilityState: { selected: true },
      icon: <View testID="icon" />,
      loading: true,
    });
    const pressable = findPressable(tree);
    const spinner = tree.root.findByProps({ testID: 'spinner' });

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
      selected: true,
    });
    expect(useResolveClassNames).toHaveBeenCalledWith('text-background');
    expect(spinner.props.color).toBe('#ffffff');
    expect(spinner.props.size).toBe('sm');
    expect(spinner.props.importantForAccessibility).toBe('no');
    expect(tree.root.findAllByProps({ testID: 'icon' })).toHaveLength(0);
  });

  test('uses a medium spinner for a large button', () => {
    const tree = render('Save', { loading: true, size: 'lg' });

    expect(tree.root.findByProps({ testID: 'spinner' }).props.size).toBe('default');
  });

  test('merges disabled state with caller accessibility state', () => {
    const pressable = findPressable(
      render('Delete', {
        accessibilityState: { checked: true },
        disabled: true,
      }),
    );

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({ checked: true, disabled: true });
  });
});
