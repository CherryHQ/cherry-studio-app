import { AppState } from 'react-native';

import { AppIconRuntime } from '@/backend/services/appIcon';

import { getSystemIntegration } from '../../../modules/system-integration';
import { installationProfiles } from './installationProfiles';

let runtime: AppIconRuntime | undefined;

export function installationAppIcon(): AppIconRuntime {
  if (!runtime) {
    runtime = new AppIconRuntime({
      native: getSystemIntegration(),
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
