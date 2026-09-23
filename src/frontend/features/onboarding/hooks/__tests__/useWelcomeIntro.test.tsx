import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useWelcomeIntro } from '../useWelcomeIntro';

let mockCoverVisible = false;
let mockConsentPending = false;
let mockFinishedCallbacks: ((finished: boolean) => void)[] = [];

jest.mock('@/frontend/appShell/startup', () => ({
  useStartupCoverVisible: () => mockCoverVisible,
}));

jest.mock('@/frontend/appShell/privacy', () => ({
  usePrivacyConsentPending: () => mockConsentPending,
}));

jest.mock('@cherrystudio/ui/motion', () => ({
  easing: { settle: 'settle' },
}));

jest.mock('../../components/LogoDraw', () => ({
  logoDrawTiming: { duration: 1300 },
}));

jest.mock('react-native-reanimated', () => {
  const { useState } = jest.requireActual('react');

  return {
    cancelAnimation: jest.fn(),
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (initial: number) => {
      const [sharedValue] = useState(() => {
        let value = initial;
        return {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      });
      return sharedValue;
    },
    // Every step is observed on its first frame, so a jump to 1 can only come from a skip.
    withDelay: (_delay: number, animation: number) => animation,
    withTiming: (_value: number, _config: object, callback?: (finished: boolean) => void) => {
      if (callback) mockFinishedCallbacks.push(callback);
      return 0;
    },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));

type Intro = ReturnType<typeof useWelcomeIntro>;

const ROOT = { y: 0, height: 874 };
const LOGO_FRAME = { y: 232, height: 104 };

function renderIntro() {
  let intro: Intro | undefined;
  let renderer: ReactTestRenderer | undefined;
  const finish = jest.fn();

  function Harness() {
    intro = useWelcomeIntro();
    return null;
  }

  act(() => {
    renderer = create(<Harness />);
  });

  const current = () => {
    if (!intro) throw new Error('useWelcomeIntro did not render');
    return intro;
  };

  Object.assign(current().rootRef, {
    current: { measureInWindow: (cb: MeasureCallback) => cb(0, ROOT.y, 402, ROOT.height) },
  });
  Object.assign(current().logoFrameRef, {
    current: {
      measureInWindow: (cb: MeasureCallback) => cb(151, LOGO_FRAME.y, 100, LOGO_FRAME.height),
    },
  });
  Object.assign(current().logoRef, { current: { finish, play: jest.fn(), replay: jest.fn() } });

  return {
    current,
    finish,
    layout() {
      act(() => current().measureLogoFrame());
    },
    rerender() {
      act(() => renderer?.update(<Harness />));
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

const opacityOf = (style: object) => (style as { opacity: number }).opacity;
const logoTranslateY = (style: object) =>
  (style as { transform: [{ translateY: number }, { scale: number }] }).transform[0].translateY;

describe('useWelcomeIntro', () => {
  let screenReaderEnabled: jest.SpyInstance;

  beforeEach(() => {
    mockCoverVisible = false;
    mockConsentPending = false;
    mockFinishedCallbacks = [];
    screenReaderEnabled = jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(false);
  });

  afterEach(() => {
    screenReaderEnabled.mockRestore();
  });

  test('holds the intro until the startup cover is gone', () => {
    mockCoverVisible = true;
    const intro = renderIntro();

    intro.layout();
    expect(intro.current().playing).toBe(false);
    expect(opacityOf(intro.current().headingStyle)).toBe(0);

    mockCoverVisible = false;
    intro.rerender();
    expect(intro.current().playing).toBe(true);
    expect(intro.current().skippable).toBe(true);
    intro.unmount();
  });

  test('holds the intro while privacy consent is pending', () => {
    mockConsentPending = true;
    const intro = renderIntro();

    intro.layout();
    expect(intro.current().playing).toBe(false);

    mockConsentPending = false;
    intro.rerender();
    expect(intro.current().playing).toBe(true);
    intro.unmount();
  });

  test('starts the logo near the vertical center of the page', () => {
    const intro = renderIntro();

    intro.layout();

    expect(logoTranslateY(intro.current().logoStyle)).toBeCloseTo(
      ROOT.height * 0.46 - (LOGO_FRAME.y + LOGO_FRAME.height / 2),
    );
    intro.unmount();
  });

  test('stops accepting skip taps once the last step lands', () => {
    const intro = renderIntro();

    intro.layout();
    expect(intro.current().skippable).toBe(true);

    act(() => mockFinishedCallbacks.forEach((callback) => callback(true)));
    expect(intro.current().skippable).toBe(false);
    expect(intro.finish).not.toHaveBeenCalled();
    intro.unmount();
  });

  test('a skip jumps the logo and content to their final state', () => {
    const intro = renderIntro();
    intro.layout();
    expect(opacityOf(intro.current().headingStyle)).toBe(0);

    act(() => intro.current().skip());
    intro.rerender();

    expect(intro.finish).toHaveBeenCalledTimes(1);
    expect(intro.current().skippable).toBe(false);
    expect(opacityOf(intro.current().headingStyle)).toBe(1);
    expect(opacityOf(intro.current().actionsStyle)).toBe(1);
    expect(logoTranslateY(intro.current().logoStyle)).toBe(0);
    intro.unmount();
  });

  test('presents the final state at once for screen reader users', async () => {
    screenReaderEnabled.mockResolvedValue(true);
    const intro = renderIntro();

    intro.layout();
    await act(async () => Promise.resolve());

    intro.rerender();
    expect(intro.finish).toHaveBeenCalledTimes(1);
    expect(intro.current().skippable).toBe(false);
    expect(opacityOf(intro.current().actionsStyle)).toBe(1);
    intro.unmount();
  });
});
