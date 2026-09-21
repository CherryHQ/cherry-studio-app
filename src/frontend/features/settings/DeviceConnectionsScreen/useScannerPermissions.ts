import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { canRequestDevicePermission, type DevicePermissionStatus } from '@/shared/contracts';

const CAMERA_PERMISSION_SCOPES = ['camera.read'] as const;
type ScannerPermissions = {
  camera?: DevicePermissionStatus;
  isPreparing: boolean;
};

export function useScannerPermissions() {
  const permissions = useBackendModule('permissions');
  const [statuses, setStatuses] = useState<ScannerPermissions>({ isPreparing: true });
  const [isActive, setIsActive] = useState(false);
  const focused = useRef(false);
  const ready = useRef(false);
  const preparation = useRef<AbortController | null>(null);

  const prepare = useCallback(
    async (requestCamera = false) => {
      if (!focused.current || preparation.current) return;
      const controller = new AbortController();
      preparation.current = controller;
      ready.current = false;
      setStatuses({ isPreparing: true });
      try {
        await permissions.requestLocalNetworkAccess(controller.signal);
        controller.signal.throwIfAborted();
        let camera = (await permissions.getStatuses(CAMERA_PERMISSION_SCOPES))['camera.read'];
        controller.signal.throwIfAborted();
        if (
          canRequestDevicePermission(camera) &&
          (requestCamera || camera?.state === 'undetermined')
        ) {
          camera = (await permissions.request(CAMERA_PERMISSION_SCOPES, controller.signal))[
            'camera.read'
          ];
        }
        controller.signal.throwIfAborted();
        setStatuses({ camera, isPreparing: false });
      } catch {
        if (!controller.signal.aborted) {
          setStatuses({
            camera: { state: 'error', canAskAgain: false },
            isPreparing: false,
          });
        }
      } finally {
        if (preparation.current === controller) {
          preparation.current = null;
          ready.current = !controller.signal.aborted;
        }
      }
    },
    [permissions],
  );

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      let hasBackgrounded = AppState.currentState === 'background';
      setIsActive(AppState.currentState === 'active');
      void prepare();
      const subscription = AppState.addEventListener('change', (state) => {
        setIsActive(state === 'active');
        // System sheets use `inactive`; returning from Settings uses `background`.
        if (state === 'background') hasBackgrounded = true;
        if (state === 'active' && hasBackgrounded) {
          hasBackgrounded = false;
          void prepare();
        }
      });
      return () => {
        focused.current = false;
        ready.current = false;
        setIsActive(false);
        preparation.current?.abort();
        preparation.current = null;
        subscription.remove();
      };
    }, [prepare]),
  );

  const canSubmit = () => focused.current && AppState.currentState === 'active' && ready.current;

  return { ...statuses, canSubmit, isActive, prepare };
}
