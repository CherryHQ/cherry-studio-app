import { use, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerFieldReadyContext } from '@/frontend/components/Composer/fieldReadiness';

import { StartupChatInputMeasurement } from '../StartupChatInputMeasurement';

let mockCovered = true;
let mockPathname = '/';
let mockAgentId: string | undefined;
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
jest.mock('@/frontend/appShell/observability', () => ({
  recordStartupChatInputReady: () => mockRecord(),
}));

function Field({ laidOut }: { laidOut: boolean }) {
  const report = use(ComposerFieldReadyContext);
  useLayoutEffect(() => report?.(laidOut), [laidOut, report]);
  return null;
}

let renderer: ReactTestRenderer | undefined;
function render(laidOut: boolean) {
  const element = (
    <StartupChatInputMeasurement>
      <Field laidOut={laidOut} />
    </StartupChatInputMeasurement>
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
