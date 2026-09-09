import * as z from 'zod';

import { getCurrentLocation } from '@/backend/services/device';

import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';

export const LOCATION_TOOL_IDS = { getCurrent: 'location_get_current' } as const;

const currentLocationSchema = z.object({ includeAddress: z.boolean() }).strict();

export function createLocationTools(deps: DeviceToolDependencies) {
  return [
    createDeviceRuntimeTool({
      capabilityId: LOCATION_TOOL_IDS.getCurrent,
      deps,
      description: 'Get the device current foreground location and optional postal address.',
      displayName: 'Current location',
      inputSchema: currentLocationSchema,
      permissionScopes: ['location.read'],
      run: async (input, signal) => {
        try {
          return await getCurrentLocation({ includeAddress: input.includeAddress }, signal);
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'code' in error
              ? String(error.code)
              : 'E_LOCATION_FAILED';
          if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw error;
          }
          if (code === 'E_LOCATION_CANCELLED') {
            throw Object.assign(new Error('Location request cancelled'), { name: 'AbortError' });
          }
          return {
            status: 'error',
            stage: 'position',
            code,
            message: `${error instanceof Error ? error.message : String(error)} Tell the user the reported reason; do not automatically repeat this location request.`,
            retryable: false,
          };
        }
      },
    }),
  ];
}
