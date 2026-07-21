import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ViewerPager } from '../ViewerPager';

let mockLegendListProps: Record<string, unknown> | undefined;

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  return {
    LegendList: (props: {
      data: { key: string; uri: string }[];
      renderItem: (info: { index: number; item: { key: string; uri: string } }) => React.ReactNode;
    }) => {
      mockLegendListProps = props;
      return props.data.map((item, index) =>
        React.createElement(React.Fragment, { key: item.key }, props.renderItem({ index, item })),
      );
    },
  };
});

jest.mock('@/components/navigation', () => {
  const React = jest.requireActual('react');
  return {
    PaintingZoomTarget: ({
      children,
      sourceKey,
    }: {
      children: React.ReactNode;
      sourceKey: string;
    }) => React.createElement('MockZoomTarget', { sourceKey }, children),
  };
});

jest.mock('../ZoomableImage', () => {
  const React = jest.requireActual('react');
  return {
    ZoomableImage: (props: Record<string, unknown>) =>
      React.createElement('MockZoomableImage', props),
  };
});

describe('ViewerPager', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    mockLegendListProps = undefined;
    await act(async () => {
      renderer = create(
        <ViewerPager
          initialIndex={0}
          items={[
            { key: 'painting-1:file-1', uri: 'file:///file-1.png' },
            { key: 'painting-2:file-2', uri: 'file:///file-2.png' },
          ]}
          onEndReached={jest.fn()}
          onPageChange={jest.fn()}
        />,
      );
    });
    await act(async () => {
      renderer?.root.findByProps({ className: 'flex-1' }).props.onLayout({
        nativeEvent: { layout: { height: 800 } },
      });
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('mounts one stable zoom target per viewer page', () => {
    expect(
      renderer?.root.findAllByType('MockZoomTarget').map((target) => target.props.sourceKey),
    ).toEqual(['painting-1:file-1', 'painting-2:file-2']);
    expect(mockLegendListProps).toBeDefined();
  });
});
