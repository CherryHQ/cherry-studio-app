import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  getPaintingZoomTransitionSourceId,
  PaintingZoomLink,
  PaintingZoomTarget,
  paintingZoomTransitionSourceIdParam,
} from '../PaintingZoomTransition';

jest.mock('@/config/constants', () => ({ isIOS: true }));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement('MockLink', props, children),
  };
});

jest.mock('expo-router/build/link/preview/native', () => {
  const React = jest.requireActual('react');
  const createMock = (name: string) => {
    const MockComponent = ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(name, props, children);
    MockComponent.displayName = name;
    return MockComponent;
  };
  return {
    LinkZoomTransitionAlignmentRectDetector: createMock('MockZoomTarget'),
    LinkZoomTransitionSource: createMock('MockZoomSource'),
  };
});

jest.mock('expo-router/build/ui/Slot', () => {
  const React = jest.requireActual('react');
  return {
    Slot: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement('MockSlot', props, children),
  };
});

describe('PaintingZoomTransition', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('uses the same stable identifier for the link, source, and target', async () => {
    const sourceKey = 'painting-1:file-1';
    const identifier = getPaintingZoomTransitionSourceId(sourceKey);

    await act(async () => {
      renderer = create(
        <>
          <PaintingZoomLink fileEntryId="file-1" paintingId="painting-1" sourceKey={sourceKey}>
            <View />
          </PaintingZoomLink>
          <PaintingZoomTarget sourceKey={sourceKey}>
            <View />
          </PaintingZoomTarget>
        </>,
      );
    });

    expect(identifier).toBe('painting-gallery:painting-1:file-1');
    expect(renderer?.root.findByType('MockLink').props.href).toEqual({
      params: {
        fileEntryId: 'file-1',
        paintingId: 'painting-1',
        [paintingZoomTransitionSourceIdParam]: identifier,
      },
      pathname: '/paintings/[paintingId]',
    });
    expect(renderer?.root.findByType('MockZoomSource').props.identifier).toBe(identifier);
    expect(renderer?.root.findByType('MockZoomTarget').props.identifier).toBe(identifier);
  });
});
