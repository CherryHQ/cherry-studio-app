import type { UniqueModelId } from '@/shared/data/types/model';
import type { ImageParamDraft } from '@/shared/utils/imageGenerationParams';

export type PaintingWorkspaceEdit = {
  output: { fileEntryId: string; uri: string };
  draft?: string;
  modelId?: UniqueModelId;
  paramValues?: ImageParamDraft;
};

type EditHandler = (request: PaintingWorkspaceEdit) => void;
const workspaces = new Map<string, EditHandler>();

/** Only mounted workspaces can receive edits from their own child viewer. */
export function registerPaintingWorkspace(id: string, edit: EditHandler) {
  workspaces.set(id, edit);
  return () => {
    if (workspaces.get(id) === edit) workspaces.delete(id);
  };
}

export function hasPaintingWorkspace(id: string | undefined) {
  return id !== undefined && workspaces.has(id);
}

export function editPaintingWorkspace(id: string | undefined, request: PaintingWorkspaceEdit) {
  const edit = id ? workspaces.get(id) : undefined;
  if (!edit) return false;
  edit(request);
  return true;
}
