import Constants from 'expo-constants';

import type { UuRemoteResult } from '@/shared/contracts/uuRemote';

type Callback = {
  url: string;
  initial: boolean;
  result?: Promise<UuRemoteResult | null>;
};

// Native links can arrive before bootstrap. Only the backend validates their one-shot results.
const callbacks: Callback[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const uuRemoteCallbacks = {
  getSnapshot: () => callbacks[0] ?? null,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  consume(callback: Callback) {
    if (callbacks[0] === callback) {
      callbacks.shift();
      notify();
    }
  },
};

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const configured = Constants.expoConfig?.scheme;
    const scheme = Array.isArray(configured) ? configured[0] : configured;
    const url = new URL(path);
    if (url.protocol !== `${scheme}:` || url.host !== 'uu-remote' || url.pathname !== '/callback')
      return path;

    if (!callbacks.some((callback) => callback.url === path)) {
      callbacks.push({ url: path, initial });
      notify();
    }
    // Warm returns do not navigate. Cold starts keep an empty route beneath the startup cover.
    return initial ? '/uu-remote/callback' : null;
  } catch {
    return path;
  }
}
