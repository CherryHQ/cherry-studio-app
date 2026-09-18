import { requireOptionalNativeModule } from 'expo';

type ObserveSdk = typeof import('expo-observe');
let observe: ObserveSdk | null | undefined;

/** Non-production binaries omit Observe; importing its JS entry would throw without the native module. */
export function getObserve(): ObserveSdk | null {
  if (observe === undefined) {
    const nativeModule = requireOptionalNativeModule('ExpoObserve');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- load the SDK only when linked
    observe = nativeModule ? (require('expo-observe') as ObserveSdk) : null;
  }
  return observe;
}
