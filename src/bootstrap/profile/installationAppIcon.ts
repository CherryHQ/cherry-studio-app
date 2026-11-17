import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { AppIconRuntime } from '@/backend/services/appIcon';

import { getSystemIntegration } from '../../../modules/system-integration';
import { installationProfiles } from './installationProfiles';

let runtime: AppIconRuntime | undefined;

export function installationAppIcon(): AppIconRuntime {
  if (!runtime) {
    const store = createMMKV({ id: 'cherry-installation-app-icon' });
    runtime = new AppIconRuntime({
      native: getSystemIntegration(),
      settings: {
        read: () => store.getBoolean('follow-account') ?? false,
        write: (enabled) => store.set('follow-account', enabled),
      },
      isEnterprise: () => installationProfiles().getActive().identity !== null,
      foreground: {
        isActive: () => AppState.currentState === 'active',
        subscribe(listener) {
          const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') listener();
          });
          return () => subscription.remove();
        },
      },
    });
  }
  return runtime;
}
