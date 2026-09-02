import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContentState } from '..';

jest.mock('../../loading/spinner', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Spinner: (props: object) => <MockView {...props} testID="content-state-spinner" />,
  };
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ color: '#ffffff' }),
}));

describe('ContentState', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });

    if (!renderer) {
      throw new Error('ContentState renderer was not created.');
    }

    return renderer;
  }

  test('renders loading with the shared spinner and busy semantics', () => {
    const tree = render(<ContentState.Loading testID="state" title="Loading assistants" />);
    const root = tree.root
      .findAllByProps({ testID: 'state' })
      .find((node) => typeof node.type === 'string');
    const spinner = tree.root.findByProps({ testID: 'content-state-spinner' });

    expect(root?.props.accessibilityState).toEqual({ busy: true });
    expect(spinner.props.accessibilityLabel).toBe('Loading assistants');
    expect(spinner.props.accessibilityRole).toBe('progressbar');
    expect(spinner.props.size).toBe('default');
    expect(tree.root.findByProps({ children: 'Loading assistants' })).toBeDefined();
  });

  test('renders optional empty content and both shared button actions', () => {
    const onCreate = jest.fn();
    const onImport = jest.fn();
    const tree = render(
      <ContentState.Empty
        description="Create one or import an existing assistant."
        icon={<View testID="empty-icon" />}
        primaryAction={{ children: 'Create', onPress: onCreate }}
        secondaryAction={{ children: 'Import', onPress: onImport }}
        title="No assistants"
      />,
    );
    const buttonViews = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    );
    const pressables = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );

    expect(tree.root.findByProps({ testID: 'empty-icon' })).toBeDefined();
    expect(tree.root.findByProps({ children: 'No assistants' })).toBeDefined();
    expect(
      tree.root.findByProps({ children: 'Create one or import an existing assistant.' }),
    ).toBeDefined();
    expect(buttonViews).toHaveLength(2);
    expect(pressables).toHaveLength(2);
    expect(buttonViews[0]?.props.className).toContain('bg-foreground');
    expect(buttonViews[1]?.props.className).toContain('bg-field');

    act(() => pressables[0]?.props.onPress());
    act(() => pressables[1]?.props.onPress());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['centered', 'items-center justify-center gap-4', 'text-center'],
    ['leading', 'items-start justify-center gap-4', 'text-left'],
    ['row', 'flex-row items-center justify-start gap-2', 'text-left'],
  ] as const)(
    'keeps %s layout and text alignment in sync',
    (layout, rootClassName, textClassName) => {
      const tree = render(
        <ContentState.Empty
          description="Description"
          layout={layout}
          testID="state"
          title="Title"
        />,
      );
      const root = tree.root
        .findAllByProps({ testID: 'state' })
        .find((node) => typeof node.type === 'string');
      const title = tree.root
        .findAllByProps({ children: 'Title' })
        .find((node) => typeof node.type === 'string');
      const description = tree.root
        .findAllByProps({ children: 'Description' })
        .find((node) => typeof node.type === 'string');

      expect(root?.props.className).toBe(rootClassName);
      expect(title?.props.className).toContain(textClassName);
      expect(description?.props.className).toContain(textClassName);
    },
  );

  test('uses a compact spinner in row layout', () => {
    const tree = render(<ContentState.Loading layout="row" title="Loading tools" />);
    const spinner = tree.root.findByProps({ testID: 'content-state-spinner' });

    expect(spinner.props.size).toBe('sm');
  });

  test('prominent content changes hierarchy without owning surrounding room', () => {
    const tree = render(
      <ContentState.Empty
        icon={<ContentState.Icon testID="empty-icon" />}
        primaryAction={{ children: 'Create', onPress: jest.fn() }}
        prominence="prominent"
        testID="state"
        title="No assistants"
      />,
    );
    const root = tree.root
      .findAllByProps({ testID: 'state' })
      .find((node) => typeof node.type === 'string');
    const button = tree.root.find(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    );
    const title = tree.root
      .findAllByProps({ children: 'No assistants' })
      .find((node) => typeof node.type === 'string');
    const disc = tree.root
      .findAllByProps({ testID: 'empty-icon' })
      .find((node) => typeof node.type === 'string');

    expect(root?.props.className).not.toContain('px-8');
    expect(root?.props.className).not.toContain('py-16');
    expect(button.props.className).toContain('rounded-full');
    expect(button.props.className).toContain('px-4 py-2.5');
    expect(title?.props.className).toContain('text-lg');
    expect(disc?.props.className).toContain('rounded-full');
    expect(disc?.props.className).toContain('bg-secondary');
  });

  test('default content uses compact rounded actions', () => {
    const tree = render(
      <ContentState.Empty
        primaryAction={{ children: 'Create', onPress: jest.fn() }}
        title="No assistants"
      />,
    );
    const button = tree.root.find(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    );
    const title = tree.root
      .findAllByProps({ children: 'No assistants' })
      .find((node) => typeof node.type === 'string');

    expect(button.props.className).toContain('rounded-xl');
    expect(button.props.className).toContain('px-3 py-2');
    expect(title?.props.className).toContain('text-base');
  });

  test('uses the error hierarchy without inventing retry behavior', () => {
    const tree = render(<ContentState.Error description="Request timed out" title="Load failed" />);
    const text = tree.root.findAllByType(Text);
    const title = text.find((node) => node.props.children === 'Load failed');
    const description = text.find((node) => node.props.children === 'Request timed out');

    expect(title?.props.className).toContain('text-destructive-foreground');
    expect(title?.props.selectable).toBe(true);
    expect(description?.props.selectable).toBe(true);
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
  });
});
