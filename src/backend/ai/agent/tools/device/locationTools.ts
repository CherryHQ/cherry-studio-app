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
      run: (input) => getCurrentLocation({ includeAddress: input.includeAddress }),
    }),
  ];
}
