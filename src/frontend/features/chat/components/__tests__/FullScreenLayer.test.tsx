import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  FullScreenLayerHost,
  FullScreenLayerProvider,
  useFullScreenLayer,
  useIsFullScreenLayerPresented,
} from '../FullScreenLayer';

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('react-native');
  const MockView = React.forwardRef(function MockView(
    props: Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    return React.createElement('MeasuredView', { ...props, ref });
  });
  return Object.defineProperties(Object.create(actual), {
    useWindowDimensions: {
      value: () => ({ fontScale: 1, height: 874, scale: 3, width: 402 }),
    },
    View: { value: MockView },
  });
});

let presented: boolean[] = [];

function Layer({ active }: { active: boolean }) {
  useFullScreenLayer(active);
  return null;
}

function Probe() {
  presented.push(useIsFullScreenLayerPresented());
  return null;
}

describe('FullScreenLayer', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    presented = [];
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('the screen stays covered until every layer is released', () => {
    act(() => {
      renderer = create(tree(true, true));
    });
    expect(presented.at(-1)).toBe(true);

    act(() => renderer!.update(tree(false, true)));
    expect(presented.at(-1)).toBe(true);

    act(() => renderer!.update(tree(false, false)));
    expect(presented.at(-1)).toBe(false);
  });

  test('the host reaches over the composer to the screen end only while a layer is shown', () => {
    act(() => {
      const createWithNodeMock = create as unknown as (
        element: ReactElement,
        options: { createNodeMock: () => unknown },
      ) => ReactTestRenderer;
      renderer = createWithNodeMock(tree(false, false), {
        createNodeMock: () => ({
          measureInWindow: (callback: (...frame: number[]) => void) => callback(0, 0, 402, 758),
        }),
      });
    });
    act(() => host().props.onLayout());
    expect(host().props.style).toBeUndefined();

    act(() => renderer!.update(tree(true, false)));
    expect(host().props.style).toEqual({ marginBottom: -116, zIndex: 20 });
    expect(host().props.accessibilityViewIsModal).toBe(true);

    act(() => renderer!.update(tree(false, false)));
    expect(host().props.style).toBeUndefined();
  });

  function tree(first: boolean, second: boolean) {
    return (
      <FullScreenLayerProvider>
        <FullScreenLayerHost>
          <Layer active={first} />
          <Layer active={second} />
        </FullScreenLayerHost>
        <Probe />
      </FullScreenLayerProvider>
    );
  }

  function host() {
    return renderer!.root.find(
      (node) => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
    );
  }
});
