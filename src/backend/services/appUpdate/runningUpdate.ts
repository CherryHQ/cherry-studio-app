import { requireOptionalNativeModule } from 'expo';

type UpdatesModule = {
  channel?: string | null;
  runtimeVersion?: string | null;
  updateId?: string | null;
  isEmbeddedLaunch?: boolean;
};

// `expo-updates` throws on import without its native module. Dev clients built before it was added
// lack that module, so read it optionally: they keep starting, with no channel and APK checks off.
const updates = requireOptionalNativeModule<UpdatesModule>('ExpoUpdates');

/** The OTA identity of the running JavaScript, fixed for the process lifetime. */
export const runningUpdate = {
  // Embedded at build time; an OTA manifest cannot change it.
  channel: updates?.channel ?? null,
  runtimeVersion: updates?.runtimeVersion ?? null,
  updateId: updates?.updateId?.toLowerCase() ?? null,
  isEmbeddedLaunch: updates?.isEmbeddedLaunch ?? null,
};
