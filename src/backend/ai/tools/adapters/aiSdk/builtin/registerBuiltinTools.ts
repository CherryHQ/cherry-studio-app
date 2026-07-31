import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { ToolRegistry } from '../registry';
import { createCalendarToolEntries, createReminderToolEntries } from './calendarTools';
import type { DeviceToolDependencies } from './deviceToolSupport';
import { createHealthToolEntries } from './healthTools';
import { createLocationToolEntry } from './locationTools';
import { createWebSearchToolEntry } from './WebSearchTool';

export function registerBuiltinTools(
  registry: ToolRegistry,
  deps: DeviceToolDependencies & { webSearch: WebSearchService },
): void {
  registry.register(createLocationToolEntry(deps));
  for (const entry of createCalendarToolEntries(deps)) registry.register(entry);
  for (const entry of createReminderToolEntries(deps)) registry.register(entry);
  for (const entry of createHealthToolEntries(deps)) registry.register(entry);
  registry.register(createWebSearchToolEntry(deps.webSearch));
}
