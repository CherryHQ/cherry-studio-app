import type { ToolSet } from 'ai';

import { createToolInspectTool, TOOL_INSPECT_TOOL_NAME } from '../meta/toolInspect';
import { createToolInvokeTool, TOOL_INVOKE_TOOL_NAME } from '../meta/toolInvoke';
import { createToolSearchTool, TOOL_SEARCH_TOOL_NAME } from '../meta/toolSearch';
import type { ToolRegistry } from '../registry';
import type { ToolEntry } from '../types';
import { shouldDefer } from './shouldDefer';

export function applyDeferExposition<TScope>(
  tools: ToolSet | undefined,
  registry: ToolRegistry<TScope>,
  contextWindow?: number,
): { tools: ToolSet | undefined; deferredEntries: ToolEntry<TScope>[] } {
  if (!tools || Object.keys(tools).length === 0) return { deferredEntries: [], tools };
  const candidates = Object.keys(tools)
    .map((name) => registry.getByName(name))
    .filter((entry): entry is ToolEntry<TScope> => entry !== undefined);
  const { deferredNames } = shouldDefer(candidates, contextWindow);
  if (deferredNames.size === 0) return { deferredEntries: [], tools };

  const inspectedNames = new Set<string>();
  const inlineTools: ToolSet = {};
  for (const [name, entry] of Object.entries(tools)) {
    if (!deferredNames.has(name)) inlineTools[name] = entry;
  }
  inlineTools[TOOL_SEARCH_TOOL_NAME] = createToolSearchTool(
    registry,
    deferredNames,
    inspectedNames,
  );
  inlineTools[TOOL_INSPECT_TOOL_NAME] = createToolInspectTool(
    registry,
    deferredNames,
    inspectedNames,
  );
  inlineTools[TOOL_INVOKE_TOOL_NAME] = createToolInvokeTool(
    registry,
    deferredNames,
    inspectedNames,
  );
  return {
    deferredEntries: candidates.filter((entry) => deferredNames.has(entry.name)),
    tools: inlineTools,
  };
}
