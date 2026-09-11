import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PortalAccessibilityBoundary, usePortalBackgroundIsolation } from '../portal-accessibility';

function Overlay({ active }: { active: boolean }) {
  usePortalBackgroundIsolation(active);
  return null;
}

function Harness({ first, second }: { first: boolean; second: boolean }) {
  return (
    <PortalAccessibilityBoundary>
      <Overlay active={first} />
      <Overlay active={second} />
    </PortalAccessibilityBoundary>
  );
}

describe('portal background accessibility', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function expectHidden(hidden: boolean) {
    const background = renderer!.root.findByType(View);
    // This native contract prevents accessibility changes from flattening or
    // unflattening an ancestor of the focused editor; Jest cannot model IME focus.
    expect(background.props.collapsable).toBe(false);
    expect(background.props.accessibilityElementsHidden).toBe(hidden);
    expect(background.props.importantForAccessibility).toBe(
      hidden ? 'no-hide-descendants' : 'auto',
    );
  }

  test('closing one overlay does not expose the background under a second overlay', () => {
    act(() => {
      renderer = create(<Harness first second />);
    });
    expectHidden(true);
    act(() => renderer?.update(<Harness first={false} second />));
    expectHidden(true);
    act(() => renderer?.update(<Harness first={false} second={false} />));
    expectHidden(false);
  });

  test('retains the native boundary before, during, and after repeated presentations', () => {
    act(() => {
      renderer = create(<Harness first={false} second={false} />);
    });
    expectHidden(false);
    act(() => {
      renderer?.update(<Harness first second={false} />);
    });
    expectHidden(true);
    act(() => renderer?.update(<Harness first={false} second={false} />));
    expectHidden(false);
    act(() => renderer?.update(<Harness first={false} second />));
    expectHidden(true);
    act(() => renderer?.update(<Harness first={false} second={false} />));
    expectHidden(false);
  });
});
