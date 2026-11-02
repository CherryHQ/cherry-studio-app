import type { AlertConfirmOptions } from '@cherrystudio/ui/components';
import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  UuRemoteError,
  type UuRemoteModule,
  type UuRemoteTarget,
} from '@/shared/contracts/uuRemote';

import { useUuRemoteAction } from '../useUuRemoteAction';

const mockConfirm: jest.MockedFunction<(options: AlertConfirmOptions) => void> = jest.fn();
const mockToast = jest.fn();
const mockUuRemote: jest.Mocked<Pick<UuRemoteModule, 'open' | 'bind'>> = {
  open: jest.fn(),
  bind: jest.fn(),
};
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockUuRemote }));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const target: UuRemoteTarget = {
  page: 'chat',
  connectionId: 'desktop',
  draftId: 'unsent-draft',
};
let actions: ReturnType<typeof useUuRemoteAction>;
let renderer: ReactTestRenderer;
function Probe() {
  const value = useUuRemoteAction();
  useLayoutEffect(() => {
    actions = value;
  }, [value]);
  return null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockUuRemote.open.mockReset().mockResolvedValue('opened');
  mockUuRemote.bind.mockReset().mockResolvedValue(undefined);
  await act(async () => {
    renderer = create(<Probe />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

test('waits for fullscreen consent and retains that choice when association is needed', async () => {
  mockUuRemote.open
    .mockRejectedValueOnce(new UuRemoteError('pip-unsupported'))
    .mockResolvedValueOnce('binding-required');

  await act(async () => actions.open(target));
  expect(mockUuRemote.open.mock.calls).toEqual([[target, 'pip']]);
  expect(mockUuRemote.bind).not.toHaveBeenCalled();
  expect(mockConfirm).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'uuRemote.fullscreen.title',
      description: 'uuRemote.fullscreen.description',
      confirmLabel: 'uuRemote.fullscreen.action',
    }),
  );

  await act(async () => mockConfirm.mock.lastCall![0].onConfirm());
  expect(mockUuRemote.open).toHaveBeenLastCalledWith(target, 'fullscreen');
  expect(mockUuRemote.bind).not.toHaveBeenCalled();
  expect(mockConfirm).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'uuRemote.bind.title',
    }),
  );

  await act(async () => mockConfirm.mock.lastCall![0].onConfirm());
  expect(mockUuRemote.bind).toHaveBeenCalledWith(target, 'fullscreen');
});

test('offers fullscreen for a UU failure callback using its saved return target', async () => {
  act(() => actions.reportError(new UuRemoteError('pip-unsupported'), target));
  expect(mockUuRemote.open).not.toHaveBeenCalled();

  await act(async () => mockConfirm.mock.lastCall![0].onConfirm());
  expect(mockUuRemote.open.mock.calls).toEqual([[target, 'fullscreen']]);
  expect(mockUuRemote.bind).not.toHaveBeenCalled();
});

test('keeps unrelated failures as errors without offering a fullscreen retry', async () => {
  mockUuRemote.open.mockRejectedValueOnce(new UuRemoteError('device-offline'));
  await act(async () => actions.open(target));

  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({ label: 'uuRemote.error.offline', variant: 'danger' });
  expect(mockUuRemote.open.mock.calls).toEqual([[target, 'pip']]);
});
