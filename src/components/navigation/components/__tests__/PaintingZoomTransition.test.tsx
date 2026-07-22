import type { ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingZoomLink, PaintingZoomTarget } from '../PaintingZoomTransition';

jest.mock('@/config/constants', () => ({ isIOS: true }));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children, ...props }: { children: ReactNode }) =>
    React.createElement('MockLink', props, children);
  Link.AppleZoom = ({ children }: { children: ReactNode }) =>
    React.createElement('MockAppleZoom', {}, children);
  Link.AppleZoomTarget = ({ children }: { children: ReactNode }) =>
    React.createElement('MockAppleZoomTarget', {}, children);
  return { Link };
});

describe('PaintingZoomTransition', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('links to the painting route and wraps source/target in the Apple zoom API', async () => {
    await act(async () => {
      renderer = create(
        <>
          <PaintingZoomLink fileEntryId="file-1" paintingId="painting-1">
            <View />
          </PaintingZoomLink>
          <PaintingZoomTarget>
            <View />
          </PaintingZoomTarget>
        </>,
      );
    });

    expect(renderer?.root.findByType('MockLink').props.href).toEqual({
      params: { fileEntryId: 'file-1', paintingId: 'painting-1' },
      pathname: '/paintings/[paintingId]',
    });
    expect(renderer?.root.findAllByType('MockAppleZoom')).toHaveLength(1);
    expect(renderer?.root.findAllByType('MockAppleZoomTarget')).toHaveLength(1);
  });
});
