import { requireOptionalNativeModule, type SharedObject } from 'expo';

type PairingRequest = SharedObject & {
  post(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; body: string }>;
  cancel(): Promise<void>;
};

export type LocalNetworkAccessModule = {
  /** Best-effort prompt trigger; completion does not report authorization. */
  request(): Promise<void>;
  PairingRequest: new () => PairingRequest;
};

export function getLocalNetworkAccess(): LocalNetworkAccessModule | null {
  return requireOptionalNativeModule<LocalNetworkAccessModule>('LocalNetworkAccess');
}
