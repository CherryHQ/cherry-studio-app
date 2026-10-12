import type { ServerTool } from '../schemas/enums';
import { normalizeVersionSeparators, stripDateSnapshot } from '../utils/normalize';
import { PROVIDER_SERVER_TOOL_MODEL_IDS } from './server-tool-models.gen';

const eligibleModelIds = new Map(
  Object.entries(PROVIDER_SERVER_TOOL_MODEL_IDS).map(([providerId, tools]) => [
    providerId,
    new Map(Object.entries(tools).map(([tool, ids]) => [tool as ServerTool, new Set(ids)])),
  ]),
);

export function isServerToolModelEligible(
  modelId: string,
  providerId: string,
  tool: ServerTool,
): boolean {
  const ids = eligibleModelIds.get(providerId)?.get(tool);
  // Hosts address a vendor's model as `vendor/model`; the reviewed IDs carry no namespace.
  const id = normalizeVersionSeparators(modelId.slice(modelId.lastIndexOf('/') + 1).toLowerCase());
  return !!ids && (ids.has(id) || ids.has(stripDateSnapshot(id)));
}
