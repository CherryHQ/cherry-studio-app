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
    const root = tree.root.findByProps({ testID: 'state' });
    const spinner = tree.root.findByProps({ testID: 'content-state-spinner' });

    expect(root.props.accessibilityState).toEqual({ busy: true });
    expect(spinner.props.accessibilityLabel).toBe('Loading assistants');
    expect(spinner.props.accessibilityRole).toBe('progressbar');
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
    const buttons = tree.root.findAll((node) => node.props.accessibilityRole === 'button');

    expect(tree.root.findByProps({ testID: 'empty-icon' })).toBeDefined();
    expect(tree.root.findByProps({ children: 'No assistants' })).toBeDefined();
    expect(
      tree.root.findByProps({ children: 'Create one or import an existing assistant.' }),
    ).toBeDefined();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.props.className).toContain('bg-foreground');
    expect(buttons[1]?.props.className).toContain('bg-field');

    act(() => buttons[0]?.props.onPress());
    act(() => buttons[1]?.props.onPress());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
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
