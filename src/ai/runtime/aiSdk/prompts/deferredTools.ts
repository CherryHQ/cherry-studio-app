import type { ToolEntry } from '../../../tools/adapters/aiSdk/types';

const HEADER = `<deferred-tools>
Some tools are not loaded inline. Discover and call them through the meta-tools.

1. tool_search: discover deferred tools by namespace.
2. tool_inspect: inspect one tool input signature.
3. tool_invoke: call an inspected tool with matching parameters.`;

export function getDeferredToolsSystemPrompt(entries: readonly ToolEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.namespace, (counts.get(entry.namespace) ?? 0) + 1);
  const namespaces = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([namespace, count]) => `  <namespace name="${namespace}" count="${count}"/>`)
    .join('\n');
  return `${HEADER}\n\n<namespaces>\n${namespaces}\n</namespaces>\n</deferred-tools>`;
}
