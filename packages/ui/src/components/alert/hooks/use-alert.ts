import { createContext, use } from 'react';

import type { AlertController } from '../alert-controller.types';

export const AlertContext = createContext<AlertController | null>(null);

export function useAlert() {
  const alert = use(AlertContext);

  if (!alert) {
    throw new Error('useAlert must be used within Alert.Provider');
  }

  return { alert };
}
