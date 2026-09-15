import Constants from 'expo-constants';

/** Google owns its callback. Never interpret the authorization response as a product route. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const clientId = Constants.expoConfig?.ios?.infoPlist?.GIDClientID;
    const scheme = typeof clientId === 'string' ? clientId.split('.').toReversed().join('.') : null;
    if (scheme && new URL(path).protocol === `${scheme}:`)
      return initial ? '/plugins/gmail/connect' : null;
  } catch {
    // Ordinary internal paths are not absolute URLs.
  }
  return path;
}
