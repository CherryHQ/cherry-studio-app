import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Avatar } from '../components/avatar';

const mockImage = jest.fn((_props: unknown) => null);

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('../../image', () => ({
  Image: (props: unknown) => mockImage(props),
}));

describe('Avatar', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  test('keeps the outer wrapper unclipped and clips the rounded face', () => {
    const tree = render(
      <Avatar accessibilityLabel="OpenAI" shape="rounded" size={26} testID="avatar">
        <Avatar.Fallback>O</Avatar.Fallback>
      </Avatar>,
    );
    const wrapper = findViewByTestId(tree, 'avatar');
    const face = findFace(tree);

    expect(wrapper.props.className.split(' ')).toEqual(
      expect.arrayContaining(['relative', 'shrink-0']),
    );
    expect(wrapper.props.className).not.toContain('overflow-hidden');
    expect(wrapper.props.style).toEqual([{ height: 26, width: 26 }, undefined]);
    expect(face.props.style).toEqual({ borderRadius: 6, height: 26, width: 26 });
    expect(face.props.className).toContain('overflow-hidden');
  });

  test('scales image and fallback content against the root size', () => {
    render(
      <Avatar accessibilityLabel="Anthropic" shape="rounded" size={32}>
        <Avatar.Image scale={5 / 7} source="anthropic-light" />
      </Avatar>,
    );
    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'anthropic-light',
        style: [{ height: 32 * (5 / 7), width: 32 * (5 / 7) }, undefined],
      }),
    );

    act(() => renderer?.unmount());
    renderer = undefined;

    const fallbackTree = render(
      <Avatar accessibilityLabel="Codex" shape="rounded" size={32}>
        <Avatar.Fallback scale={0.75} testID="fallback" textProps={{ testID: 'initial' }}>
          C
        </Avatar.Fallback>
      </Avatar>,
    );
    const fallback = findViewByTestId(fallbackTree, 'fallback');

    expect(fallback.props.style[0]).toEqual({ borderRadius: 6, height: 24, width: 24 });
    expect(fallbackTree.root.findByProps({ testID: 'initial' }).props.children).toBe('C');
  });

  test('renders badges outside the clipped face', () => {
    const tree = render(
      <Avatar accessibilityLabel="Account" size={40} testID="avatar">
        <Avatar.Fallback>A</Avatar.Fallback>
        <Avatar.Badge placement="bottom-end" testID="badge">
          <Text>2</Text>
        </Avatar.Badge>
      </Avatar>,
    );
    const wrapper = findViewByTestId(tree, 'avatar');
    const face = findFace(tree);
    const badge = findViewByTestId(tree, 'badge');

    expect(face.findAllByProps({ testID: 'badge' })).toHaveLength(0);
    expect(
      wrapper.findAll((node) => node.type === View && node.props.testID === 'badge'),
    ).toHaveLength(1);
    expect(badge.props.className.split(' ')).toEqual(
      expect.arrayContaining(['absolute', '-bottom-1', '-right-1']),
    );
  });

  test('requires compound parts to be nested in Avatar', () => {
    expect(() => render(<Avatar.Badge />)).toThrow('Avatar.Badge must be used inside <Avatar>.');
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });

    if (!renderer) {
      throw new Error('Avatar renderer was not created.');
    }

    return renderer;
  }

  function findFace(tree: ReactTestRenderer) {
    return tree.root.findAll((node) => node.props.accessibilityRole === 'image')[0];
  }

  function findViewByTestId(tree: ReactTestRenderer, testID: string) {
    return tree.root.find((node) => node.type === View && node.props.testID === testID);
  }
});
