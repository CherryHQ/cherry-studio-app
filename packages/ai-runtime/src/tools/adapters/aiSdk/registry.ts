import { emitToolRuntimeDiagnostic, type ToolEntry, type ToolRuntimeDiagnostics } from './types';

export type ToolFilter = {
  namespace?: string;
  query?: string;
};

export class ToolRegistry<TScope = unknown> {
  private readonly entries = new Map<string, ToolEntry<TScope>>();

  constructor(readonly diagnostics?: ToolRuntimeDiagnostics) {}

  register(entry: ToolEntry<TScope>): void {
    if (this.entries.has(entry.name)) {
      throw new Error(`Tool already registered: ${entry.name}`);
    }
    this.entries.set(entry.name, entry);
  }

  getAll(filter: ToolFilter = {}): ToolEntry<TScope>[] {
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

  getByName(name: string): ToolEntry<TScope> | undefined {
    return this.entries.get(name);
  }

  getByNamespace(filter: ToolFilter = {}): Map<string, ToolEntry<TScope>[]> {
    const grouped = new Map<string, ToolEntry<TScope>[]>();
    for (const entry of this.getAll(filter)) {
      const entries = grouped.get(entry.namespace) ?? [];
      entries.push(entry);
      grouped.set(entry.namespace, entries);
    }
    return grouped;
  }

  selectActive(scope: TScope): ToolEntry<TScope>[] {
    const active: ToolEntry<TScope>[] = [];
    for (const entry of this.getAll()) {
      try {
        if (entry.applies && !entry.applies(scope)) {
          continue;
        }
        active.push(entry.buildTool ? { ...entry, tool: entry.buildTool(scope) } : entry);
      } catch (error) {
        emitToolRuntimeDiagnostic(this.diagnostics, {
          code: 'tool-materialization-failed',
          error,
          toolName: entry.name,
        });
      }
    }
    return active;
  }
}
