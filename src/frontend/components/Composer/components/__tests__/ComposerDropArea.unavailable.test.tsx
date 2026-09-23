import { type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ImageDropTargetView } from '../../../../../../modules/image-drop-target';
import { ComposerProvider } from '../../context/ComposerProvider';
import { ComposerDropArea } from '../ComposerDropArea';

jest.mock('expo', () => {
  const React = jest.requireActual('react');
  function MockExpoView(props: { children?: ReactNode }) {
    return React.createElement('mock-expo-view', props);
  }
  return {
    // A client built without the ImageDropTarget pod (Expo Go, an older
    // development client): resolving the native view throws, so the module
    // export resolves to null and the composer falls back to a plain container.
    // Only ImageDropTarget throws — the rest of the import graph (@expo/ui and
    // friends) resolves its own views/modules against harmless stand-ins.
    requireNativeView: (viewName: string) => {
      if (viewName === 'ImageDropTarget') {
        throw new Error('ImageDropTarget was not built into this client');
      }
      return MockExpoView;
    },
    requireNativeModule: () => ({}),
    requireOptionalNativeModule: () => null,
  };
});

jest.mock('@cherrystudio/ui/components', () => ({
  // The real component package does not import in the node test environment;
  // only the toast hook is needed here.
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

let probeRendered = false;

function MountProbe() {
  probeRendered = true;
  return null;
}

describe('ComposerDropArea with the native view unavailable', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    probeRendered = false;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders a plain container instead of the drop surface', async () => {
    // The module resolved tolerantly at import: no crash, just no capability.
    expect(ImageDropTargetView).toBeNull();

    await act(async () => {
      renderer = create(
        <ComposerProvider>
          <ComposerDropArea>
            <MountProbe />
          </ComposerDropArea>
        </ComposerProvider>,
      );
    });

    // Mounting at all is the fallback proof: the unavailable branch renders a
    // plain container around the children instead of a null component.
    expect(probeRendered).toBe(true);
  });
});
