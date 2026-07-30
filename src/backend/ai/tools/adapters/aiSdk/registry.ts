import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ToolApplyScope, ToolEntry } from './types';

const logger = loggerService.withContext('ToolRegistry');

export type ToolFilter = {
  namespace?: string;
  query?: string;
};

export class ToolRegistry {
  private readonly entries = new Map<string, ToolEntry>();

  register(entry: ToolEntry): void {
    if (this.entries.has(entry.name)) {
      throw new Error(`Tool already registered: ${entry.name}`);
    }
    this.entries.set(entry.name, entry);
  }

  getAll(filter: ToolFilter = {}): ToolEntry[] {
    let entries = [...this.entries.values()];
    if (filter.namespace) {
      entries = entries.filter((entry) => entry.namespace === filter.namespace);
    }
    if (filter.query) {
      const query = filter.query.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(query) ||
          entry.namespace.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query),
      );
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  }

  getByName(name: string): ToolEntry | undefined {
    return this.entries.get(name);
  }

  getByNamespace(filter: ToolFilter = {}): Map<string, ToolEntry[]> {
    const grouped = new Map<string, ToolEntry[]>();
    for (const entry of this.getAll(filter)) {
      const entries = grouped.get(entry.namespace) ?? [];
      entries.push(entry);
      grouped.set(entry.namespace, entries);
    }
    return grouped;
  }

  selectActive(scope: ToolApplyScope): ToolEntry[] {
    const active: ToolEntry[] = [];
    for (const entry of this.getAll()) {
      try {
        if (entry.applies && !entry.applies(scope)) {
          continue;
        }
        active.push(entry.buildTool ? { ...entry, tool: entry.buildTool(scope) } : entry);
      } catch (error) {
        logger.warn('Tool request materialization failed; treating it as inactive', {
          error,
          toolName: entry.name,
        });
      }
    }
    return active;
  }
}
