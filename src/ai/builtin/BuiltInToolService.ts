import type { Tool, ToolSet } from 'ai';
import { Platform } from 'react-native';

import type { PreferenceAppKeyType } from '@/data/preference';
import type { PreferenceService } from '@/data/services/PreferenceService';
import type { DevicePermissionService } from '@/services/devicePermissions';

import {
  createCalendarCreateTools,
  createCalendarModifyTools,
  createCalendarReadTools,
  createReminderReadTools,
  createReminderWriteTools,
} from './calendarTools';
import { createHealthTools } from './healthTools';
import { createLocationTools } from './locationTools';

type BuiltInToolServiceDependencies = {
  devicePermission: DevicePermissionService;
  preference: PreferenceService;
};

type ToolGroup = {
  createTools: () => ToolSet;
  preferenceKeys: readonly PreferenceAppKeyType[];
};

const toolGroups: ToolGroup[] = [
  { createTools: createLocationTools, preferenceKeys: ['permissions.location_read'] },
  { createTools: createHealthTools, preferenceKeys: ['permissions.health_read'] },
  { createTools: createCalendarReadTools, preferenceKeys: ['permissions.calendar_read'] },
  { createTools: createCalendarCreateTools, preferenceKeys: ['permissions.calendar_write'] },
  {
    createTools: createCalendarModifyTools,
    preferenceKeys: ['permissions.calendar_read', 'permissions.calendar_write'],
  },
  { createTools: createReminderReadTools, preferenceKeys: ['permissions.reminders_read'] },
  { createTools: createReminderWriteTools, preferenceKeys: ['permissions.reminders_write'] },
];

export class BuiltInToolService {
  constructor(private readonly deps: BuiltInToolServiceDependencies) {}

  async getToolSet(): Promise<ToolSet | undefined> {
    const enabledGroups = await Promise.all(
      toolGroups.map(async (group) => {
        if (
          Platform.OS !== 'ios' &&
          group.preferenceKeys.some((key) => key.startsWith('permissions.reminders_'))
        ) {
          return undefined;
        }

        const modes = await Promise.all(
          group.preferenceKeys.map((key) => this.deps.preference.app.get(key)),
        );
        if (modes.some((mode) => mode === 'never')) {
          return undefined;
        }
        const systemStatuses = await Promise.all(
          group.preferenceKeys.map((key) => this.deps.devicePermission.getStatusForPreference(key)),
        );
        return systemStatuses.every((status) => status === 'granted') ? group : undefined;
      }),
    );
    const result: ToolSet = {};
    for (const group of enabledGroups) {
      if (!group) {
        continue;
      }
      for (const [name, rawTool] of Object.entries(group.createTools())) {
        result[name] = this.guardTool(name, rawTool, group.preferenceKeys);
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private guardTool(
    name: string,
    rawTool: Tool,
    preferenceKeys: readonly PreferenceAppKeyType[],
  ): Tool {
    const execute = rawTool.execute;
    if (!execute) {
      return rawTool;
    }

    return {
      ...rawTool,
      metadata: {
        cherry: {
          tool: {
            name,
            type: 'builtin',
          },
        },
      },
      needsApproval: async () => {
        const modes = await Promise.all(
          preferenceKeys.map((key) => this.deps.preference.app.get(key)),
        );
        return modes.some((mode) => mode === 'ask');
      },
      execute: async (...args: Parameters<typeof execute>) => {
        const modes = await Promise.all(
          preferenceKeys.map((key) => this.deps.preference.app.get(key)),
        );
        if (modes.some((mode) => mode === 'never')) {
          throw new Error(`Built-in tool ${name} is disabled`);
        }
        const systemStatuses = await Promise.all(
          preferenceKeys.map((key) => this.deps.devicePermission.getStatusForPreference(key)),
        );
        if (systemStatuses.some((status) => status !== 'granted')) {
          throw new Error(`Built-in tool ${name} requires system permission`);
        }
        return execute(...args);
      },
    } as Tool;
  }
}
