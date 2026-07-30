import { tool } from 'ai';
import * as z from 'zod';

import { getCurrentLocation } from '../../../device/location';
import {
  createDeviceToolEntry,
  type DeviceToolDependencies,
  deviceToolErrorSchema,
  deviceToolModelOutput,
  runDeviceTool,
} from './deviceToolSupport';
import { locationOutputSchema } from './outputSchemas';
import { DEVICE_TOOL_NAMES } from './toolNames';

const description = 'Get the device current foreground location and optional postal address.';

export function createLocationToolEntry(deps: DeviceToolDependencies) {
  return createDeviceToolEntry({
    deps,
    description,
    name: DEVICE_TOOL_NAMES.locationGetCurrent,
    namespace: 'location',
    preferenceKeys: ['permissions.location_read'],
    tool: tool({
      description,
      inputSchema: z.object({ includeAddress: z.boolean() }).strict(),
      outputSchema: z.union([locationOutputSchema, deviceToolErrorSchema]),
      strict: true,
      execute: async ({ includeAddress }, options) =>
        runDeviceTool(() => getCurrentLocation({ includeAddress }), options),
      toModelOutput: ({ output }) => deviceToolModelOutput(output),
    }),
  });
}
