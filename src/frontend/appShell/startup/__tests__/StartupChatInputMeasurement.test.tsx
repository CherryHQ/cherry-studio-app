import { use, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { RequiredUpdateContext } from '@/frontend/appShell/appUpdate/requiredUpdate';
import { ComposerFieldReadyContext } from '@/frontend/components/Composer/fieldReadiness';

import { StartupChatInputMeasurement } from '../StartupChatInputMeasurement';

let mockCovered = true;
let mockPathname = '/';
let mockAgentId: string | undefined;
let requiredUpdate = false;
let mockStartupInterrupted = false;
let mockReceivingShare = false;
let mockShareCheck: 'checking' | 'clear' | 'excluded' = 'clear';
const mockRecord = jest.fn();

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => ({ agentId: mockAgentId }),
}));
jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: jest.fn() }) },
}));
jest.mock('../StartupReadinessContext', () => ({ useStartupCoverVisible: () => mockCovered }));
jest.mock('@/frontend/appShell/account', () => ({ useAccount: () => ({ state: {} }) }));
jest.mock('@/frontend/appShell/privacy', () => ({ usePrivacyConsentPending: () => false }));
jest.mock('@/shared/core/logger/startupDiagnostics', () => ({
  wasStartupInterrupted: () => mockStartupInterrupted,
}));
jest.mock('@/frontend/appShell/systemEntry', () => ({
  useSystemEntryReceiving: () => mockReceivingShare,
  useSystemShareDestination: () => ({ startupShareCheck: mockShareCheck }),
}));
jest.mock('@/frontend/appShell/observability', () => ({
  recordStartupChatInputReady: (at: number) => mockRecord(at),
}));

function Field({ laidOut }: { laidOut: boolean }) {
  const report = use(ComposerFieldReadyContext);
  useLayoutEffect(() => report?.(laidOut), [laidOut, report]);
  return null;
}

let renderer: ReactTestRenderer | undefined;
function render(laidOut: boolean) {
  const element = (
    <RequiredUpdateContext value={requiredUpdate}>
      <StartupChatInputMeasurement>
        <Field laidOut={laidOut} />
      </StartupChatInputMeasurement>
    </RequiredUpdateContext>
  );
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

beforeEach(() => {
  mockCovered = true;
  mockPathname = '/';
  mockAgentId = undefined;
  requiredUpdate = false;
  mockStartupInterrupted = false;
  mockReceivingShare = false;
  mockShareCheck = 'clear';
  mockRecord.mockClear();
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test.each([true, false])(
  'records once after both input layout and splash exit (layout first: %s)',
  (layoutFirst) => {
    render(false);
    mockAgentId = 'remembered';
    mockCovered = layoutFirst;
    render(layoutFirst);
    expect(mockRecord).not.toHaveBeenCalled();
    mockCovered = false;
    render(true);
    render(false);
    render(true);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  },
);

test('leaving the launch route disqualifies a later return to chat', () => {
  render(false);
  mockPathname = '/home';
  render(false);
  mockPathname = '/';
  mockCovered = false;
  mockAgentId = 'remembered';
  render(true);
  expect(mockRecord).not.toHaveBeenCalled();
});

test('a background transition before the navigator mounted disqualifies an active launch', () => {
  mockStartupInterrupted = true;
  render(false);
  mockCovered = false;
  mockAgentId = 'remembered';
  render(true);
  expect(mockRecord).not.toHaveBeenCalled();
});

test('a mandatory update that opens before field layout disqualifies the launch', () => {
  render(false);
  mockCovered = false;
  mockAgentId = 'remembered';
  requiredUpdate = true;
  render(true);
  requiredUpdate = false;
  render(true);
  expect(mockRecord).not.toHaveBeenCalled();
});

test('an empty share check confirms the original input-ready time', () => {
  jest.useFakeTimers();
  try {
    mockShareCheck = 'checking';
    render(false);
    mockCovered = false;
    mockAgentId = 'remembered';
    const readyAt = performance.now();
    render(true);
    expect(mockRecord).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    mockShareCheck = 'clear';
    render(true);
    expect(mockRecord.mock.calls).toEqual([[readyAt]]);
  } finally {
    jest.useRealTimers();
  }
});

test('a staged share importing underneath the home route disqualifies its ready field', () => {
  mockShareCheck = 'checking';
  render(false);
  mockCovered = false;
  mockAgentId = 'remembered';
  mockReceivingShare = true;
  render(true);
  mockReceivingShare = false;
  mockShareCheck = 'excluded';
  render(true);
  expect(mockRecord).not.toHaveBeenCalled();
});
