import type { ToolRegistry } from '@cherrystudio/ai-runtime/tools';

import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { ProviderSetupModule } from '@/shared/contracts';

import type { ToolApplyScope } from '../../../types';
import { createCalendarToolEntries, createReminderToolEntries } from './calendarTools';
import type { DeviceToolDependencies } from './deviceToolSupport';
import { createHealthToolEntries } from './healthTools';
import { createLocationToolEntry } from './locationTools';
import { createProviderConfigurationToolEntries } from './providerConfigurationTools';
import { createWebFetchToolEntry } from './WebFetchTool';
import { createWebSearchToolEntry } from './WebSearchTool';

export function registerBuiltinTools(
  registry: ToolRegistry<ToolApplyScope>,
  deps: DeviceToolDependencies & {
    providerSetup: Pick<ProviderSetupModule, 'executeBuiltin' | 'executeCustom' | 'resolveBuiltin'>;
    webSearch: WebSearchService;
  },
): void {
  registry.register(createLocationToolEntry(deps));
  for (const entry of createCalendarToolEntries(deps)) registry.register(entry);
  for (const entry of createReminderToolEntries(deps)) registry.register(entry);
  for (const entry of createHealthToolEntries(deps)) registry.register(entry);
  registry.register(createWebFetchToolEntry(deps.webSearch));
  registry.register(createWebSearchToolEntry(deps.webSearch));
  for (const entry of createProviderConfigurationToolEntries(deps.providerSetup)) {
    registry.register(entry);
  }
}
