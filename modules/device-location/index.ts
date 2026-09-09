import { requireOptionalNativeModule } from 'expo';

export type DeviceLocation = {
  coords: {
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    latitude: number;
    longitude: number;
    speed: number | null;
  };
  provider: string | null;
  timestamp: number;
};

export type DeviceLocationModule = {
  createRequest(): string;
  getCurrentPosition(requestId: string): Promise<DeviceLocation>;
  cancelRequest(requestId: string): void;
};

export function getDeviceLocation(): DeviceLocationModule | null {
  return requireOptionalNativeModule<DeviceLocationModule>('DeviceLocation');
}
