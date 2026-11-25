import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerCollapsible } from '../composer-collapsible';

const mockReducedMotion = { value: false };
const mockWithTiming = jest.fn(
  (value: number, _config?: object, _finish?: (completed: boolean) => void) => value,
);
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'bezier' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion.value,
    useSharedValue: (initial: number) => ({
      set(next: number) {
        this.value = next;
      },
      value: initial,
    }),
    withTiming: (...args: unknown[]) => mockWithTiming(...(args as [number])),
  };
});

// `Composer.Collapsible` reads no context, so unlike its siblings it stands on
// its own — that is the point of it being a plain container.
describe('Composer.Collapsible', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockReducedMotion.value = false;
    jest.clearAllMocks();
  });

  function render(children: React.ReactNode) {
    act(() => {
      renderer = create(<ComposerCollapsible testID="row">{children}</ComposerCollapsible>);
    });

    return renderer!;
  }

  function update(tree: ReactTestRenderer, children: React.ReactNode) {
    act(() => {
      tree.update(<ComposerCollapsible testID="row">{children}</ComposerCollapsible>);
    });
  }

  // A testID matches both the component that declares it and the host view it
  // renders; the innermost one is the one carrying the resolved props.
  function row(tree: ReactTestRenderer) {
    const matches = tree.root.findAllByProps({ testID: 'row' });

    return matches[matches.length - 1]!;
  }

  it('renders what it is given', () => {
    const tree = render(<Text>Searching the web</Text>);

    expect(tree.root.findAllByType(Text)).toHaveLength(1);
    expect(row(tree).props.pointerEvents).toBe('auto');
  });

  it('keeps the last frame on screen so the collapse has something to shrink', () => {
    const tree = render(<Text>Searching the web</Text>);

    update(tree, null);

    // The caller has already stopped passing it; without the held frame this
    // would be an empty box animating down to nothing.
    expect(tree.root.findAllByType(Text)).toHaveLength(1);
    expect(row(tree).props.accessibilityElementsHidden).toBe(true);
    expect(row(tree).props.importantForAccessibility).toBe('no-hide-descendants');
    expect(row(tree).props.pointerEvents).toBe('none');
  });

  it('releases the closing tree only if that collapse is still current', () => {
    const tree = render(<Text>First</Text>);
    update(tree, null);
    const firstClose = mockWithTiming.mock.calls.at(-1)?.[2];
    expect(firstClose).toBeDefined();
    update(tree, <Text>Second</Text>);
    act(() => firstClose!(true));
    expect(tree.root.findByType(Text).props.children).toBe('Second');

    update(tree, null);
    const secondClose = mockWithTiming.mock.calls.at(-1)?.[2];
    act(() => secondClose!(true));
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });

  it('treats a false child as collapsed, not as content', () => {
    // `{cond && <x />}` yields false rather than null, and a row that renders it
    // as content would sit there at full height showing nothing.
    const tree = render(false);

    expect(row(tree).props.pointerEvents).toBe('none');
  });

  it('reopens with the new content rather than the held frame', () => {
    const tree = render(<Text>Searching the web</Text>);

    update(tree, null);
    update(tree, <Text>Reading 3 sources</Text>);

    const [text] = tree.root.findAllByType(Text);

    expect(text?.props.children).toBe('Reading 3 sources');
  });

  // Structural rather than behavioural, because the failure it guards is
  // invisible to a renderer that never lays anything out: measured in flow, the
  // content of a row that starts collapsed never lays out at all, `onLayout`
  // never fires, and the row stays shut forever while every other test passes.
  it('measures its content out of flow so a closed row can still report a height', () => {
    const tree = render(<Text>Searching the web</Text>);
    const measured = tree.root.findAll((node) => typeof node.props.onLayout === 'function');

    expect(measured[measured.length - 1]?.props.className).toContain('absolute');
  });

  it('waits for measured content height before animating opacity or height', () => {
    const tree = render(<Text>Delayed</Text>);
    expect(mockWithTiming).not.toHaveBeenCalled();

    const measured = tree.root.findAll((node) => typeof node.props.onLayout === 'function').at(-1);
    act(() => measured!.props.onLayout({ nativeEvent: { layout: { height: 48 } } }));

    expect(mockWithTiming.mock.calls.map(([value]) => value)).toEqual([1, 48]);
  });

  it('reports active transition state until completion or unmount', () => {
    const onAnimatingChange = jest.fn();
    act(() => {
      renderer = create(
        <ComposerCollapsible onAnimatingChange={onAnimatingChange} testID="row">
          <Text>Body</Text>
        </ComposerCollapsible>,
      );
    });
    const measured = renderer!.root
      .findAll((node) => typeof node.props.onLayout === 'function')
      .at(-1);
    act(() => measured!.props.onLayout({ nativeEvent: { layout: { height: 48 } } }));
    expect(onAnimatingChange).toHaveBeenNthCalledWith(1, true);

    const finishOpen = mockWithTiming.mock.calls.at(-1)?.[2];
    act(() => finishOpen!(true));
    expect(onAnimatingChange).toHaveBeenNthCalledWith(2, false);

    act(() => {
      renderer!.update(
        <ComposerCollapsible onAnimatingChange={onAnimatingChange} testID="row">
          {null}
        </ComposerCollapsible>,
      );
    });
    expect(onAnimatingChange).toHaveBeenNthCalledWith(3, true);
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(onAnimatingChange).toHaveBeenNthCalledWith(4, false);
  });

  it('lands on the final size instead of animating when motion is reduced', () => {
    mockReducedMotion.value = true;

    render(<View />);

    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});
