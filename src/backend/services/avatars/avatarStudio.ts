import {
  buildParamsSchema,
  imageParamsSchema,
  type ImageGenerationSupport,
  type ParamValues,
} from '@cherrystudio/provider-registry';
import { fromByteArray, toByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import type { ModelService } from '@/backend/data/services/ModelService';
import { storageDirectory } from '@/backend/data/storage/storagePaths';
import { decodeRgba, encodePng } from '@/backend/services/file/rgbaImageCodec';
import { removeFlatBackground } from '@/backend/utils/rgbaImage';
import type { AiFailureInput } from '@/shared/contracts/aiFailure';
import {
  AVATAR_STUDIO_EXPRESSIONS,
  AvatarStudioDraftSchema,
  type AvatarStudioDraft,
  type AvatarStudioExpression,
  type AvatarStudioModule,
  type AvatarStudioState,
} from '@/shared/contracts/avatarStudio';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { UniqueModelId } from '@/shared/data/types/model';
import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

import type { AvatarCharacters } from './avatarCharacters';
import { validateAvatarBase, validateAvatarExpression } from './avatarStudioQuality';

const logger = loggerService.withContext('AvatarStudio');
const SIZE = 768;
const EXPRESSIONS: Record<AvatarStudioExpression, string> = {
  blink: 'eyes gently closed, same calm smile',
  thinking: 'eyes looking up to one side, small pursed mouth',
  waiting: 'eyes wide toward the viewer, raised eyebrows, small open mouth',
  done: 'happy closed eyes, big smile and blush',
  error: 'worried eyes, tilted eyebrows, small wavy frown',
};

function imageParameters(support: ImageGenerationSupport, mode: 'generate' | 'edit'): ParamValues {
  const fields = support.modes[mode]!.supports;
  const values: Record<string, unknown> = fields.n ? { n: 1 } : {};
  const size = fields.size;
  if (size?.type === 'enum') {
    const square = size.options.find((value) => /^(\d+)x\1$/u.test(value));
    if (square) values.size = square;
  }
  const aspect = fields.aspectRatio;
  if (aspect?.type === 'enum' && aspect.options.includes('1:1')) values.aspectRatio = '1:1';
  return imageParamsSchema.parse(buildParamsSchema(support, mode).parse(values));
}

export function createAvatarStudio(dependencies: {
  ai: {
    generateImage(input: {
      uniqueModelId: UniqueModelId;
      mode: 'generate' | 'edit';
      prompt: string;
      inputImages?: string[];
      paramValues: ParamValues;
      requestOptions: { signal: AbortSignal; maxRetries: number };
    }): Promise<{ images: { base64: string; mediaType: string }[] }>;
  };
  normalizeError(error: unknown): AiFailureInput;
  models: Pick<ModelService, 'getById'>;
  characters: Pick<AvatarCharacters, 'saveCharacter' | 'removeCharacter'>;
}): AvatarStudioModule {
  const root = () => new Directory(storageDirectory(), 'avatar-studio');
  const record = () => new File(root(), 'draft.json');
  let controller: AbortController | null = null;
  let active: string | null = null;
  const read = async () =>
    record().exists ? AvatarStudioDraftSchema.parse(JSON.parse(await record().text())) : null;
  const write = (draft: AvatarStudioDraft) => {
    root().create({ intermediates: true, idempotent: true });
    const file = record();
    if (!file.exists) file.create();
    file.write(JSON.stringify(AvatarStudioDraftSchema.parse(draft)));
  };
  const requireDraft = async (id: string) => {
    const draft = await read();
    if (!draft || draft.id !== id) throw new Error('avatar_draft_changed');
    return draft;
  };
  const requireModel = async (modelId: AvatarStudioDraft['modelId']) => {
    const model = await dependencies.models.getById(modelId);
    if (!model?.imageGeneration?.modes.generate || !model.imageGeneration.modes.edit) {
      throw new Error('avatar_model_unsupported');
    }
    return model.imageGeneration;
  };
  const exclusive = async <T>(label: string, work: (signal: AbortSignal) => Promise<T>) => {
    if (controller) throw new Error('avatar_busy');
    const owner = new AbortController();
    controller = owner;
    active = label;
    try {
      return await work(owner.signal);
    } finally {
      controller = null;
      active = null;
    }
  };
  const frameBytes = async (frame: { file: string }) => new File(root(), frame.file).bytes();
  const selected = (draft: AvatarStudioDraft) => {
    const frame = draft.candidates.find((candidate) => candidate.id === draft.selectedId);
    if (!frame) throw new Error('avatar_select_base');
    return frame;
  };
  return {
    async get(): Promise<AvatarStudioState> {
      const draft = await read();
      const frames = draft ? [...draft.candidates, ...Object.values(draft.expressions)] : [];
      return {
        draft,
        active,
        images: Object.fromEntries(
          frames.map((frame) => [frame.id, new File(root(), frame.file).uri]),
        ),
      };
    },
    async start(input) {
      await exclusive('start', async () => {
        if (await read()) throw new Error('avatar_draft_exists');
        const draft = AvatarStudioDraftSchema.parse({
          ...input,
          id: randomUUID(),
          candidates: [],
          expressions: {},
          sampleConfirmed: false,
        });
        await requireModel(draft.modelId);
        write(draft);
      });
    },
    async selectCandidate(id, candidateId) {
      await exclusive('select', async () => {
        const draft = await requireDraft(id);
        if (draft.selectedId === candidateId) return;
        if (draft.selectedId || !draft.candidates.some((candidate) => candidate.id === candidateId))
          throw new Error('avatar_draft_changed');
        write({ ...draft, selectedId: candidateId, error: undefined });
      });
    },
    async generate(id, step) {
      await exclusive(step, async (signal) => {
        const draft = await requireDraft(id);
        try {
          if (draft.characterId) throw new Error('avatar_draft_changed');
          const support = await requireModel(draft.modelId);
          const baseFrame = step === 'candidates' ? null : selected(draft);
          if (step === 'candidates' && draft.selectedId) throw new Error('avatar_draft_changed');
          if (step === 'expressions' && (!draft.sampleConfirmed || !draft.expressions.blink))
            throw new Error('avatar_confirm_sample');
          const baseBytes = baseFrame ? await frameBytes(baseFrame) : null;
          const base = baseBytes ? decodeRgba(baseBytes, SIZE) : null;
          const targets =
            step === 'candidates'
              ? ['candidate-a', 'candidate-b'].slice(draft.candidates.length)
              : (step === 'sample' ? (['blink'] as const) : AVATAR_STUDIO_EXPRESSIONS).filter(
                  (name) => !draft.expressions[name],
                );
          for (const target of targets) {
            signal.throwIfAborted();
            active = target;
            const expression = base ? (target as AvatarStudioExpression) : null;
            const mode = expression ? 'edit' : 'generate';
            const prompt = expression
              ? `Edit the attached image. Change ONLY eyes, eyebrows, mouth and blush to: ${EXPRESSIONS[expression]}. Keep the same character, head outline, hair, ears, accessories, clothing, pose, framing, size, position and flat background exactly unchanged.`
              : `${draft.prompt}. Original character, head and shoulders only, large centered head facing the viewer, upright, eyes open, calm closed-mouth smile. Entire head, ears and accessories inside the image with 8% empty margin. Plain solid ${draft.keyColor === 'green' ? '#00FF00 green' : '#FF00FF magenta'} background; do not use this color on the character. No shadows on the background, text or frame. ${target === 'candidate-b' ? 'Offer an alternative design with distinct small details.' : ''}`;
            // The app supplies the operation and reference; model-written prompts cannot remove them.
            const result = await dependencies.ai.generateImage({
              uniqueModelId: draft.modelId,
              mode,
              prompt,
              ...(baseBytes
                ? { inputImages: [`data:image/png;base64,${fromByteArray(baseBytes)}`] }
                : {}),
              paramValues: imageParameters(support, mode),
              requestOptions: { signal, maxRetries: 0 },
            });
            signal.throwIfAborted();
            const output = result.images[0];
            if (!output) throw new Error('avatar_empty_result');
            const image = decodeRgba(toByteArray(output.base64), SIZE);
            if (base) validateAvatarExpression(base, image);
            else validateAvatarBase(image);
            const frame = { id: randomUUID(), file: `${randomUUID()}.png` };
            const file = new File(root(), frame.file);
            const next = {
              ...draft,
              error: undefined,
              ...(expression
                ? { expressions: { ...draft.expressions, [expression]: frame } }
                : { candidates: [...draft.candidates, frame] }),
            };
            try {
              file.create();
              file.write(encodePng(image));
              write(next);
              Object.assign(draft, next);
            } catch (error) {
              if (file.exists) file.delete();
              throw error;
            }
          }
        } catch (error) {
          if (!signal.aborted) {
            const diagnosticId = randomUUID();
            const normalized = dependencies.normalizeError(error);
            const code =
              error instanceof Error && error.message.startsWith('avatar_')
                ? error.message
                : classifyAiFailureReason(normalized);
            draft.error = { code, diagnosticId };
            logger.error('Avatar stage failed', new Error(normalized.message), {
              diagnosticId,
              draftId: id,
              stage: active,
              code,
            });
            try {
              write(draft);
            } catch (writeError) {
              logger.error('Could not persist avatar failure', writeError as Error, {
                diagnosticId,
              });
            }
          }
          throw error;
        }
      });
    },
    async confirmSample(id) {
      await exclusive('confirm', async () => {
        const draft = await requireDraft(id);
        selected(draft);
        if (!draft.expressions.blink) throw new Error('avatar_confirm_sample');
        write({ ...draft, sampleConfirmed: true, error: undefined });
      });
    },
    async retryExpression(id, expression) {
      await exclusive('retry', async () => {
        const draft = await requireDraft(id);
        if (draft.characterId) throw new Error('avatar_draft_changed');
        const sample = draft.expressions[expression];
        delete draft.expressions[expression];
        write({
          ...draft,
          sampleConfirmed: expression === 'blink' ? false : draft.sampleConfirmed,
          error: undefined,
        });
        if (sample) new File(root(), sample.file).delete();
      });
    },
    async save(id) {
      return exclusive('save', async () => {
        const draft = await requireDraft(id);
        if (draft.characterId) return draft.characterId;
        if (
          !draft.sampleConfirmed ||
          AVATAR_STUDIO_EXPRESSIONS.some((name) => !draft.expressions[name])
        )
          throw new Error('avatar_incomplete');
        const frames = { idle: selected(draft), ...draft.expressions };
        const layers: Parameters<AvatarCharacters['saveCharacter']>[0]['layers'] = {};
        const base = decodeRgba(await frameBytes(frames.idle));
        for (const [name, frame] of Object.entries(frames)) {
          const image = decodeRgba(await frameBytes(frame));
          if (name !== 'idle') validateAvatarExpression(base, image);
          layers[name] = { bytes: encodePng(removeFlatBackground(image, 40)), extension: 'png' };
        }
        const characterId = await dependencies.characters.saveCharacter({
          manifest: { version: 1, name: draft.name, size: SIZE, rig: { sways: [] } },
          layers,
        });
        try {
          write({ ...draft, characterId, error: undefined });
        } catch (error) {
          await dependencies.characters.removeCharacter(characterId);
          throw error;
        }
        return characterId;
      });
    },
    cancel() {
      controller?.abort();
    },
    async discard(id) {
      await exclusive('discard', async () => {
        await requireDraft(id);
        root().delete();
      });
    },
  };
}
