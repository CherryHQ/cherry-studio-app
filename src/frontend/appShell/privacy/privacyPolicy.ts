import Constants from 'expo-constants';

/**
 * The published privacy policy, supplied per build through the `PRIVACY_POLICY_URL`
 * environment variable and carried in `extra` by `app.config.ts`.
 *
 * It is build configuration rather than a source constant because the address
 * differs per environment and must not need a code change to correct. Production
 * builds fail in `app.config.ts` when it is missing, so a release cannot ship a
 * placeholder; development and preview builds may omit it and simply hide the link.
 *
 * The consent sheet carries its own summary, so it stays a complete notice even
 * when this is absent or the device is offline.
 */
export function getPrivacyPolicyUrl(): string | undefined {
  const url = Constants.expoConfig?.extra?.privacyPolicyUrl;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}
