import { requireOptionalNativeModule } from 'expo';

interface CloudSigningNativeModule {
  sign(value: string): Promise<string | null>;
}

/** Older clients and builds without the optional Cloud credential retain device-only signing. */
export async function signCloudRequest(value: string): Promise<string | null> {
  return (
    requireOptionalNativeModule<CloudSigningNativeModule>('CherryCloudSigning')?.sign(value) ?? null
  );
}
