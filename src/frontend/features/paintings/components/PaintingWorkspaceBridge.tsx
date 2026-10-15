import { useLayoutEffect } from 'react';

import { useComposerActions } from '@/frontend/components/Composer';
import { useModelPickerData } from '@/frontend/components/ModelPicker';
import { usePaintingInputSession } from '@/frontend/components/PaintingInput';
import { reconcileImageParamDraft } from '@/shared/utils/imageGenerationParams';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';
import {
  registerPaintingWorkspace,
  type PaintingWorkspaceEdit,
} from '../utils/paintingWorkspaceSession';

/** Keep the composer mounted while the native viewer borrows its image. */
export function PaintingWorkspaceBridge({
  workspaceId,
  onEdit,
}: {
  workspaceId: string;
  onEdit: (output: PaintingWorkspaceEdit['output']) => void;
}) {
  const { setAttachments, setDraft } = useComposerActions();
  const session = usePaintingInputSession();
  const models = useModelPickerData({ modelType: 'image' });
  useLayoutEffect(
    () =>
      registerPaintingWorkspace(workspaceId, (request) => {
        setAttachments([createPaintingOutputAttachmentDraft(request.output)]);
        session.reference.clear();
        if (request.draft) setDraft((current) => (current.trim() ? current : request.draft!));
        // Resize choices belong to the model shown in the viewer. Ordinary edits
        // retain the workspace's current model and all of its parameter drafts.
        if (request.modelId && request.paramValues) {
          const model = models.getModelItem(request.modelId)?.model;
          const strategy = createPaintingGenerationStrategy(model);
          const mode = strategy.resolveParameters(1);
          if (model && mode) {
            const key = JSON.stringify([model.id, mode.mode]);
            const previous =
              session.parameterDrafts[key]?.values ??
              (session.lastParameterDraft?.modelId === model.id
                ? session.lastParameterDraft.values
                : {});
            session.selectLocalModel(request.modelId);
            session.setParameterDraft(key, {
              modelId: model.id,
              values: reconcileImageParamDraft({ ...previous, ...request.paramValues }, mode),
            });
          }
        }
        onEdit(request.output);
      }),
    [models, onEdit, session, setAttachments, setDraft, workspaceId],
  );
  return null;
}
