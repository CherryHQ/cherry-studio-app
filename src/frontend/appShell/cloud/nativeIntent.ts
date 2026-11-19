import Constants from 'expo-constants';

let pendingReturn = false;
type AmdBrowserVisit = { accountId: string; activating: boolean };
let openedBrowser: AmdBrowserVisit | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const cloudAmdReturn = {
  getSnapshot: () => pendingReturn,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  consume() {
    if (!pendingReturn) return false;
    pendingReturn = false;
    notify();
    return true;
  },
  markBrowserOpened(visit: AmdBrowserVisit) {
    openedBrowser = visit;
  },
  consumeBrowserOpen() {
    const wasOpened = openedBrowser;
    openedBrowser = undefined;
    return wasOpened;
  },
};

export function redirectCloudAmdSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const configured = Constants.expoConfig?.scheme;
  const schemes = Array.isArray(configured) ? configured : [configured];
  if (!schemes.some((scheme) => scheme && path === `${scheme}://navigate/settings/provider`))
    return undefined;

  pendingReturn = true;
  notify();
  // A running app can keep the current chat and its draft mounted.
  return initial ? '/' : null;
}
