import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SpeechPlaybackBar, type SpeechPlaybackBarProps } from '../SpeechPlaybackBar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => '#006600',
}));

jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/pause', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/play', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    Spinner: (props: object) => createElement('Spinner', props),
    Surface: ({ children, ...props }: { children?: unknown }) =>
      createElement('Surface', props, children),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => jest.fn(), linear: jest.fn() },
    cancelAnimation: jest.fn(),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useSharedValue: (initial: number) => ({ get: () => initial, set: jest.fn() }),
    withDelay: (_d: number, value: number) => value,
    withRepeat: (value: number) => value,
    withSequence: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(() => ({
    remove: jest.fn(),
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderBar(overrides: Partial<SpeechPlaybackBarProps> = {}) {
  const props: SpeechPlaybackBarProps = {
    title: 'Daily Summary',
    subtitle: 'Cherry Agent',
    phase: 'playing',
    canReturnToSource: false,
    onTogglePause: jest.fn(),
    onStop: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<SpeechPlaybackBar {...props} />);
  });
  return { props, renderer };
}

test('shows preparing spinner with disabled pause control before audio starts', () => {
  const { renderer } = renderBar({ phase: 'preparing' });
  expect(renderer.root.findByProps({ testID: 'speech-playback-spinner' })).toBeTruthy();
  const pauseBtn = renderer.root.findByProps({ testID: 'speech-playback-toggle-pause' });
  expect(pauseBtn.props.disabled).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'speech-waveform-playing' })).toHaveLength(0);
});

test('shows completed-chunk progress inside info column, active waveform, and pause/stop controls', () => {
  const onTogglePause = jest.fn();
  const onStop = jest.fn();
  const { renderer } = renderBar({
    phase: 'playing',
    progress: { completedChunks: 1, totalChunks: 4 },
    onTogglePause,
    onStop,
  });

  expect(renderer.root.findByProps({ testID: 'speech-waveform-playing' })).toBeTruthy();
  const progress = renderer.root.findByProps({ testID: 'speech-playback-progress' });
  expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });

  const pauseBtn = renderer.root.findByProps({ testID: 'speech-playback-toggle-pause' });
  expect(pauseBtn.props.disabled).toBe(false);
  expect(pauseBtn.props.accessibilityLabel).toBe('voice.speech.pause');
  act(() => pauseBtn.props.onPress());
  expect(onTogglePause).toHaveBeenCalledTimes(1);

  const stopBtn = renderer.root.findByProps({ testID: 'speech-playback-stop' });
  act(() => stopBtn.props.onPress());
  expect(onStop).toHaveBeenCalledTimes(1);
});

test('never reports 100% progress before final chunk completes and shows paused controls when away from source', () => {
  const onReturnToSource = jest.fn();
  const { renderer } = renderBar({
    phase: 'paused',
    progress: { completedChunks: 1, totalChunks: 2 },
    canReturnToSource: true,
    onReturnToSource,
  });

  const progress = renderer.root.findByProps({ testID: 'speech-playback-progress' });
  expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });

  expect(renderer.root.findByProps({ testID: 'speech-waveform-paused' })).toBeTruthy();
  const resumeBtn = renderer.root.findByProps({ testID: 'speech-playback-toggle-pause' });
  expect(resumeBtn.props.accessibilityLabel).toBe('voice.speech.resume');

  const returnBtn = renderer.root.findByProps({ testID: 'speech-playback-return' });
  expect(returnBtn.props.accessibilityLabel).toBe('voice.speech.returnToConversation');
  act(() => returnBtn.props.onPress());
  expect(onReturnToSource).toHaveBeenCalledTimes(1);

  const nearEnd = renderBar({
    phase: 'playing',
    progress: { completedChunks: 199, totalChunks: 200 },
  });
  expect(
    nearEnd.renderer.root.findByProps({ testID: 'speech-playback-progress' }).props
      .accessibilityValue,
  ).toEqual({ min: 0, max: 100, now: 99 });

  const complete = renderBar({
    phase: 'playing',
    progress: { completedChunks: 200, totalChunks: 200 },
  });
  expect(
    complete.renderer.root.findByProps({ testID: 'speech-playback-progress' }).props
      .accessibilityValue,
  ).toEqual({ min: 0, max: 100, now: 100 });

  const single = renderBar({ phase: 'playing', progress: { completedChunks: 0, totalChunks: 1 } });
  expect(single.renderer.root.findAllByProps({ testID: 'speech-playback-progress' })).toHaveLength(
    0,
  );
});

test('syncs pre-mount Reduce Motion accessibility changes on mount', async () => {
  const { cancelAnimation } =
    jest.requireMock<typeof import('react-native-reanimated')>('react-native-reanimated');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  renderBar({ phase: 'playing' });
  await act(async () => {
    await Promise.resolve();
  });
  expect(cancelAnimation).toHaveBeenCalled();
});
