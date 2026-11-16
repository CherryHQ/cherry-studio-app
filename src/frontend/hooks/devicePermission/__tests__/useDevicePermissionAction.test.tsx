import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import {
  type Backend,
  type DevicePermissionScope,
  HEALTH_PERMISSION_SCOPES,
  type PermissionStatuses,
} from '@/shared/contracts';

import type { PermissionKind } from '../permissionConfig';
import { useDevicePermissionAction } from '../useDevicePermissionAction';

const mockRequest = jest.fn(async (_scopes: readonly DevicePermissionScope[]) => ({}));
const mockOpenSettings = jest.fn(async (_permission: string) => {});
const mockShowAlert = jest.fn();
const mockShowToast = jest.fn();
const refresh = jest.fn(async () => {});
const backend = {
  permissions: { request: mockRequest, openSystemSettings: mockOpenSettings },
} as unknown as Backend;

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockShowAlert } }),
  useToast: () => ({ toast: { show: mockShowToast } }),
}));

const undetermined = { state: 'undetermined', canAskAgain: true } as const;
const statuses: PermissionStatuses = {
  ...Object.fromEntries(HEALTH_PERMISSION_SCOPES.map((scope) => [scope, undetermined])),
  'camera.read': undetermined,
};
let latest: Partial<Record<PermissionKind, ReturnType<typeof useDevicePermissionAction>>>;

function ActionHarness({
  kind,
  permissions,
}: {
  kind: PermissionKind;
  permissions: PermissionStatuses;
}) {
  const action = useDevicePermissionAction({ kind, statuses: permissions, refresh });
  useEffect(() => {
    latest[kind] = action;
  }, [action, kind]);
  return null;
}

describe('shared device permission action', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    latest = {};
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  async function mount(kind: PermissionKind, permissions = statuses) {
    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <ActionHarness kind={kind} permissions={permissions} />
          <ActionHarness kind="camera" permissions={statuses} />
        </BackendProvider>,
      );
    });
  }

  test('preserves the original full health request, including record-selection scopes', async () => {
    await mount('health');
    await act(async () => latest.health!.handlePress());

    expect(mockRequest).toHaveBeenCalledWith(HEALTH_PERMISSION_SCOPES);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('a pending health request affects only its own action', async () => {
    let finishRequest!: (value: PermissionStatuses) => void;
    mockRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    await mount('health');
    let request: Promise<void> | undefined;
    await act(async () => {
      request = latest.health!.handlePress();
    });

    expect(latest.health!.pending).toBe(true);
    expect(latest.camera!.pending).toBe(false);
    expect(latest.camera!.action).toBe('request');
    await act(async () => {
      finishRequest({});
      await request;
    });
    expect(latest.health!.pending).toBe(false);
  });

  test('upgrades add-only calendar access through the original read request', async () => {
    await mount('calendar', {
      'calendar.read': { state: 'denied', canAskAgain: true },
      'calendar.write': { state: 'granted', canAskAgain: false },
    });
    await act(async () => latest.calendar!.handlePress());

    expect(mockRequest).toHaveBeenCalledWith(['calendar.read']);
  });

  test('shows the original Health management guidance after authorization was requested', async () => {
    await mount(
      'health',
      Object.fromEntries(
        HEALTH_PERMISSION_SCOPES.map((scope) => [
          scope,
          { state: 'requested', canAskAgain: false },
        ]),
      ),
    );
    await act(async () => latest.health!.handlePress());

    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });
});
