import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ViewerImage } from '../ViewerImage';

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

describe('ViewerImage', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    await act(async () => {
      renderer = create(<ViewerImage sourceKey="painting-1:file-1" uri="file:///file-1.png" />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('wraps the single image in a zoom target keyed to the gallery item', () => {
    const target = renderer?.root.findByType('MockZoomTarget');
    expect(target?.props.sourceKey).toBe('painting-1:file-1');
    expect(renderer?.root.findAllByType('MockZoomableImage')).toHaveLength(0);
  });

  it('mounts the zoomable image once the container is measured', async () => {
    await act(async () => {
      renderer?.root.findByProps({ className: 'flex-1' }).props.onLayout({
        nativeEvent: { layout: { height: 800 } },
      });
    });

    const image = renderer?.root.findByType('MockZoomableImage');
    expect(image?.props).toMatchObject({ height: 800, uri: 'file:///file-1.png' });
  });
});
