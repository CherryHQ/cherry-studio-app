import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ViewerImage } from '../ViewerImage';

jest.mock('@/components/navigation', () => {
  const React = jest.requireActual('react');
  return {
    PaintingZoomTarget: ({ children }: { children: React.ReactNode }) =>
      React.createElement('MockZoomTarget', {}, children),
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
      renderer = create(<ViewerImage uri="file:///file-1.png" />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('wraps the single image in a zoom target before the container is measured', () => {
    expect(renderer?.root.findAllByType('MockZoomTarget')).toHaveLength(1);
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
