import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { captureFeedbackScreenshot, removeFeedbackScreenshot } from '../feedbackScreenshot';
import { useShakeFeedback } from '../useShakeFeedback';

const mockRemove = jest.fn();
let mockMotion: (sample: { x: number; y: number; z: number; timestamp: number }) => void;
jest.mock('../../../../../modules/diagnostics', () => ({
  observeDiagnosticMotion: (listener: typeof mockMotion) => {
    mockMotion = listener;
    return { remove: mockRemove };
  },
}));
jest.mock('../feedbackScreenshot', () => ({
  captureFeedbackScreenshot: jest.fn(),
  removeFeedbackScreenshot: jest.fn(),
}));

const screenshot = { id: 'capture', uri: 'file:///capture.png' };
const onCaptured = jest.fn();
let renderer: ReactTestRenderer;
let stateChanged: (state: AppStateStatus) => void;
let removeAppState: jest.Mock;
function Probe({ enabled = true, route = '/home' }: { enabled?: boolean; route?: string }) {
  useShakeFeedback({ enabled, route, onCaptured });
  return null;
}
function shake(start = 0) {
  mockMotion({ x: 3, y: 0, z: 1, timestamp: start });
  mockMotion({ x: 0, y: 0, z: 1, timestamp: start + 50 });
  mockMotion({ x: -3, y: 0, z: 1, timestamp: start + 200 });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  removeAppState = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    stateChanged = callback;
    return { remove: removeAppState };
  });
  jest.mocked(captureFeedbackScreenshot).mockResolvedValue(screenshot);
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  jest.restoreAllMocks();
});

test('captures before opening and blocks repeated shakes while capture/navigation is pending', async () => {
  let resolve!: (image: typeof screenshot) => void;
  jest.mocked(captureFeedbackScreenshot).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  act(() => {
    shake();
    shake(3000);
  });
  expect(captureFeedbackScreenshot).toHaveBeenCalledTimes(1);
  expect(onCaptured).not.toHaveBeenCalled();
  await act(async () => {
    resolve(screenshot);
  });
  expect(onCaptured).toHaveBeenCalledWith(screenshot);
  act(() => shake(6000));
  expect(captureFeedbackScreenshot).toHaveBeenCalledTimes(1);
});

test.each(['background', 'route', 'unmount', 'disabled'])(
  'discards late captures after %s',
  async (change) => {
    let resolve!: (image: typeof screenshot) => void;
    jest.mocked(captureFeedbackScreenshot).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    act(() => shake());
    act(() => {
      if (change === 'background') {
        AppState.currentState = 'background';
        stateChanged('background');
        AppState.currentState = 'active';
        stateChanged('active');
      } else if (change === 'route') renderer.update(<Probe route="/settings" />);
      else if (change === 'disabled') renderer.update(<Probe enabled={false} />);
      else renderer.unmount();
    });
    await act(async () => {
      resolve(screenshot);
    });
    expect(onCaptured).not.toHaveBeenCalled();
    expect(removeFeedbackScreenshot).toHaveBeenCalledWith(screenshot);
    expect(mockRemove).toHaveBeenCalled();
  },
);

test('opens text feedback when capture fails and releases subscriptions when disabled', async () => {
  jest.mocked(captureFeedbackScreenshot).mockRejectedValueOnce(new Error('capture unavailable'));
  await act(async () => shake());
  expect(onCaptured).toHaveBeenCalledWith(undefined);
  act(() => renderer.update(<Probe enabled={false} />));
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
});

test('disabling stops observation and prevents background/foreground from restarting it', () => {
  act(() => renderer.update(<Probe enabled={false} />));
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
  act(() => shake());
  expect(captureFeedbackScreenshot).not.toHaveBeenCalled();
  act(() => renderer.update(<Probe enabled={false} route="/settings/privacy" />));
  expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
});
