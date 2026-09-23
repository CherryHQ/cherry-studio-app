import { createElement, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ImageDropEvent, ImageDropTargetProps } from '../index';
import { ImageDropTargetView } from '../index';

type MockNativeViewProps = {
  children?: ReactNode;
  enabled?: boolean;
  onDragEnter?: (event: { nativeEvent: Record<string, never> }) => void;
  onDragLeave?: (event: { nativeEvent: Record<string, never> }) => void;
  onDropImages?: (event: { nativeEvent: ImageDropEvent }) => void;
  style?: unknown;
};

/** The props the wrapper forwarded to the raw native view on the last render. */
let mockNativeProps: MockNativeViewProps | null = null;

jest.mock('expo', () => ({
  // The raw native view stand-in: captures the props the wrapper forwards so
  // the tests can fire events the way React Native delivers them — the payload
  // wrapped in a synthetic event under `nativeEvent`.
  requireNativeView: () => {
    const React = require('react');
    const { View } = require('react-native');
    return function MockNativeImageDropTarget(props: MockNativeViewProps) {
      mockNativeProps = props;
      return React.createElement(View, { testID: 'native-drop-target' }, props.children);
    };
  },
}));

function getView(): ComponentType<ImageDropTargetProps> {
  if (!ImageDropTargetView) {
    throw new Error('ImageDropTargetView should resolve with the mocked expo module');
  }
  return ImageDropTargetView;
}

function dropImage(name: string) {
  return {
    height: 800,
    id: `drop-${name}`,
    mediaType: 'image/jpeg',
    name,
    size: 1024,
    uri: `file:///cache/ImageDropTarget/${name}`,
    width: 600,
  };
}

let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

describe('ImageDropTargetView', () => {
  beforeEach(() => {
    mockNativeProps = null;
  });

  it('unwraps the synthetic event envelope before the product callback', async () => {
    const onDropImages = jest.fn();
    await act(async () => {
      renderer = create(createElement(getView(), { onDropImages }));
    });

    // React Native wraps the dispatched body in a synthetic event; the product
    // callback must see the bare ImageDropEvent, not the envelope.
    const event: ImageDropEvent = {
      failedCount: 1,
      images: [dropImage('kept.jpg')],
      totalDropped: 2,
    };
    await act(async () => mockNativeProps?.onDropImages?.({ nativeEvent: event }));

    expect(onDropImages).toHaveBeenCalledTimes(1);
    expect(onDropImages).toHaveBeenCalledWith(event);
  });

  it('forwards drag enter/leave without the envelope', async () => {
    const onDragEnter = jest.fn();
    const onDragLeave = jest.fn();
    await act(async () => {
      renderer = create(createElement(getView(), { onDragEnter, onDragLeave }));
    });

    await act(async () => mockNativeProps?.onDragEnter?.({ nativeEvent: {} }));
    expect(onDragEnter).toHaveBeenCalledTimes(1);
    expect(onDragEnter).toHaveBeenCalledWith();

    await act(async () => mockNativeProps?.onDragLeave?.({ nativeEvent: {} }));
    expect(onDragLeave).toHaveBeenCalledTimes(1);
    expect(onDragLeave).toHaveBeenCalledWith();
  });

  it('passes enabled, style, and children through to the native view', async () => {
    const style = { flex: 1 };
    await act(async () => {
      renderer = create(
        createElement(
          getView(),
          { enabled: false, style },
          createElement(View, { testID: 'child' }),
        ),
      );
    });

    expect(mockNativeProps?.enabled).toBe(false);
    expect(mockNativeProps?.style).toBe(style);
    expect(renderer?.root.findByProps({ testID: 'child' })).toBeTruthy();
  });
});
