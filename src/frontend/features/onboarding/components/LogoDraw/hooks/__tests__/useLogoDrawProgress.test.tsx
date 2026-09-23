import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useLogoDrawProgress } from '../useLogoDrawProgress';

jest.mock('react-native-reanimated', () => ({
  cancelAnimation: jest.fn(),
  Easing: { cubic: 'cubic', inOut: (curve: unknown) => curve },
  runOnJS: (callback: () => void) => callback,
  useAnimatedReaction: jest.fn(),
  withSequence: (...animations: unknown[]) => animations[0],
  withSpring: jest.fn(),
  withTiming: (value: number) => value,
}));

function renderProgress(controlled: boolean) {
  const progress = { value: 0 };
  const onSettle = jest.fn();
  let controls: ReturnType<typeof useLogoDrawProgress> | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Harness() {
    controls = useLogoDrawProgress({
      progress: progress as never,
      controlled,
      autoPlay: false,
      onSettle,
    });
    return null;
  }

  act(() => {
    renderer = create(<Harness />);
  });

  return {
    progress,
    onSettle,
    finish() {
      act(() => controls?.finish());
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

describe('useLogoDrawProgress finish', () => {
  test('jumps the internal timeline to the settled end', () => {
    const logo = renderProgress(false);

    logo.finish();

    expect(logo.progress.value).toBe(1);
    expect(logo.onSettle).toHaveBeenCalledTimes(1);
    logo.unmount();
  });

  test('leaves externally driven progress alone', () => {
    const logo = renderProgress(true);

    logo.finish();

    expect(logo.progress.value).toBe(0);
    expect(logo.onSettle).not.toHaveBeenCalled();
    logo.unmount();
  });
});
