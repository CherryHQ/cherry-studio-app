import type { AppStateStatus } from 'react-native';

/** Wait until the app has both resumed and regained window focus after the Android chooser. */
export function createShareReturnGate(isActive: boolean, onReturn: () => void) {
  let active = isActive;
  let focused = isActive;
  let pending = false;
  let disposed = false;

  const flush = () => {
    if (!pending || !active || !focused || disposed) return;
    pending = false;
    onReturn();
  };

  return {
    suspend() {
      focused = false;
    },
    request() {
      pending = true;
      flush();
    },
    onAppStateChange(state: AppStateStatus) {
      active = state === 'active';
      if (!active) focused = false;
      flush();
    },
    onFocus() {
      focused = true;
      flush();
    },
    onBlur() {
      focused = false;
    },
    dispose() {
      disposed = true;
      pending = false;
    },
  };
}
