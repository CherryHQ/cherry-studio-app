import { type ToolSet, tool } from 'ai';
import * as Location from 'expo-location';
import * as z from 'zod';

import { withNativeToolTimeout } from './toolUtils';

const currentLocationInput = z
  .object({
    includeAddress: z
      .boolean()
      .default(true)
      .describe('Whether to include a reverse-geocoded postal address when available.'),
  })
  .strict();

export function createLocationTools(): ToolSet {
  return {
    builtin_get_current_location: tool({
      description: 'Get the device current foreground location and optional postal address.',
      inputSchema: currentLocationInput,
      strict: true,
      execute: async ({ includeAddress }) => {
        const location = await withNativeToolTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          'Current location request',
        );
        const address = includeAddress
          ? await withNativeToolTimeout(
              Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }),
              'Reverse geocoding',
            )
              .then((results) => results[0])
              .catch(() => undefined)
          : undefined;

        return {
          address: address
            ? {
                city: address.city ?? null,
                country: address.country ?? null,
                district: address.district ?? null,
                formattedAddress: address.formattedAddress ?? null,
                isoCountryCode: address.isoCountryCode ?? null,
                name: address.name ?? null,
                postalCode: address.postalCode ?? null,
                region: address.region ?? null,
                street: address.street ?? null,
                subregion: address.subregion ?? null,
              }
            : null,
          coords: {
            accuracy: location.coords.accuracy ?? null,
            altitude: location.coords.altitude ?? null,
            altitudeAccuracy: location.coords.altitudeAccuracy ?? null,
            heading: location.coords.heading ?? null,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed ?? null,
          },
          timestamp: new Date(location.timestamp).toISOString(),
        };
      },
    }),
  };
}
