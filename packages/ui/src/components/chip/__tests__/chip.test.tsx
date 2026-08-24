import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Chip } from '../chip';

jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);

jest.mock('heroui-native/utils', () => {
  return {
    cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
  };
});

describe('Chip', () => {
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
      throw new Error('Chip renderer was not created.');
    }

    return renderer;
  }

  function findByAccessibilityRole(tree: ReactTestRenderer, role: string) {
    const match = tree.root.findAll((node) => node.props.accessibilityRole === role)[0];

    if (!match) {
      throw new Error(`No element with accessibilityRole="${role}" was rendered.`);
    }

    return match;
  }

  test('renders a non-interactive tag with layered neutral colors', () => {
    const tree = render(<Chip.Tag testID="tag">Research</Chip.Tag>);
    const tag = tree.root
      .findAllByProps({ testID: 'tag' })
      .find((node) => typeof node.props.className === 'string');
    const label = tree.root.findByType(Text);

    expect(tag).toBeDefined();
    expect(tree.root.findAll((node) => node.props.accessibilityRole != null)).toHaveLength(0);
    expect(tag?.props.className.split(' ')).toEqual(
      expect.arrayContaining(['border-border', 'bg-secondary', 'rounded-full']),
    );
    expect(label.props.children).toBe('Research');
    expect(label.props.className).toContain('text-foreground');
  });

  test('toggles a selectable chip and exposes its checked state', () => {
    const onSelectedChange = jest.fn();
    const tree = render(
      <Chip.Selectable onSelectedChange={onSelectedChange} selected>
        Web search
      </Chip.Selectable>,
    );
    const selectable = findByAccessibilityRole(tree, 'checkbox');

    expect(selectable.props.accessibilityRole).toBe('checkbox');
    expect(selectable.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(selectable.props.className.split(' ')).toEqual(
      expect.arrayContaining(['border-border-selected', 'bg-secondary-active']),
    );

    act(() => selectable.props.onPress());
    expect(onSelectedChange).toHaveBeenCalledWith(false);
  });

  test('keeps an unselected chip within the base neutral hierarchy', () => {
    const tree = render(
      <Chip.Selectable onSelectedChange={jest.fn()} selected={false}>
        Reasoning
      </Chip.Selectable>,
    );
    const selectable = findByAccessibilityRole(tree, 'checkbox');

    expect(selectable.props.accessibilityState.checked).toBe(false);
    expect(selectable.props.className.split(' ')).toEqual(
      expect.arrayContaining(['border-border', 'bg-secondary']),
    );
    expect(selectable.props.className.split(' ')).not.toContain('border-border-selected');
  });

  test('gives a removable chip one dedicated accessible remove action', () => {
    const onRemove = jest.fn();
    const tree = render(
      <Chip.Removable
        onRemove={onRemove}
        removeAccessibilityLabel="Remove Web search"
        testID="removable"
      >
        Web search
      </Chip.Removable>,
    );
    const removeButton = findByAccessibilityRole(tree, 'button');
    const removable = tree.root
      .findAllByProps({ testID: 'removable' })
      .find((node) => typeof node.props.className === 'string');

    expect(removable?.props.className.split(' ')).toEqual(
      expect.arrayContaining(['border-border-selected', 'bg-secondary-active']),
    );
    expect(removeButton.props.accessibilityLabel).toBe('Remove Web search');
    expect(removeButton.props.accessibilityRole).toBe('button');

    act(() => removeButton.props.onPress());
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('disables both selectable and removable interactions', () => {
    const selectableTree = render(
      <Chip.Selectable disabled onSelectedChange={jest.fn()} selected={false}>
        Search
      </Chip.Selectable>,
    );
    const selectable = findByAccessibilityRole(selectableTree, 'checkbox');

    expect(selectable.props.disabled).toBe(true);
    expect(selectable.props.accessibilityState.disabled).toBe(true);

    act(() => renderer?.unmount());
    renderer = undefined;

    const removableTree = render(
      <Chip.Removable disabled onRemove={jest.fn()} removeAccessibilityLabel="Remove Search">
        Search
      </Chip.Removable>,
    );
    const removeButton = findByAccessibilityRole(removableTree, 'button');

    expect(removeButton.props.disabled).toBe(true);
    expect(removeButton.props.accessibilityState.disabled).toBe(true);
  });
});
