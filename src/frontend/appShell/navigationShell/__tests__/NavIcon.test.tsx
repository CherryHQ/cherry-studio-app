import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NavIcon } from '../NavIcon';
import { NAV_DESTINATION_IDS, type NavTabId } from '../navRouteManifest';

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({}),
}));

jest.mock('react-native-svg', () => {
  const { createElement, forwardRef } = jest.requireActual('react');
  const mockNode = (name: string) =>
    forwardRef(function MockSvgNode(
      { children, ...props }: { children?: ReactNode },
      ref: unknown,
    ) {
      return createElement(name, { ...props, ref }, children);
    });

  return {
    __esModule: true,
    default: mockNode('Svg'),
    Circle: mockNode('Circle'),
    Ellipse: mockNode('Ellipse'),
    G: mockNode('G'),
    Line: mockNode('Line'),
    Path: mockNode('Path'),
    Polygon: mockNode('Polygon'),
    Polyline: mockNode('Polyline'),
    Rect: mockNode('Rect'),
    Svg: mockNode('Svg'),
  };
});

describe('NavIcon', () => {
  let renderer: ReactTestRenderer | undefined;
  const tabIds = NAV_DESTINATION_IDS.filter((id): id is NavTabId => id !== 'settings');

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it.each(tabIds)('renders outline and filled states for %s from @cherrystudio/app-icons', (id) => {
    for (const filled of [false, true]) {
      act(() => {
        renderer = create(<NavIcon color="#123456" filled={filled} id={id} size={22} />);
      });

      const tree = renderer!.toJSON();
      expect(tree).not.toBeNull();
      expect(JSON.stringify(tree)).toContain('#123456');
    }
  });
});
