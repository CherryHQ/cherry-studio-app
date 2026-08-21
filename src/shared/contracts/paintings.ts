import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';

import type { FileEntryId } from '@/shared/data/types/file';
import type { UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

import type { ResolvedFile } from './file';

export type PaintingSourceImage = {
  fileEntryId?: FileEntryId;
  id: string;
  mediaType: string;
  name: string;
  uri: string;
};

export type PaintingGenerationInput = {
  images: readonly PaintingSourceImage[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  /** Display-name snapshot used by background presentation while the job runs. */
  modelName: string;
  /**
   * Retry an interrupted receipt in place rather than minting a new one. The
   * receipt must have no outputs — passing a finished painting is rejected,
   * since reusing it would delete the images it already holds.
   */
  paintingId?: string;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationOutput = {
  fileEntryId: FileEntryId;
  uri: string;
};

export type PaintingGenerationResult = {
  outputs: PaintingGenerationOutput[];
  painting: Painting;
};

export type ResolvedPaintingFiles = {
  inputs: ResolvedFile[];
  outputs: ResolvedFile[];
};

export type PaintingGenerationStart = {
  jobId: string;
  /**
   * The receipt this job writes into — the caller has no other way to learn it
   * for a fresh generation, and it is what makes the screen restorable (the
   * job is found again by painting, not by the id it happened to be handed).
   */
  paintingId: string;
};

export interface PaintingsModule {
  cancelGeneration(jobId: string): Promise<void>;
  resolveFiles(painting: Painting): Promise<ResolvedPaintingFiles>;
  /**
   * Creates the painting receipt and enqueues a `painting.generate` job
   * atomically. The generation outlives the calling screen; observe the job's
   * ledger row (`GET /jobs/:id`) for progress and the terminal
   * {@link PaintingGenerationResult} in its output.
   */
  startGeneration(input: PaintingGenerationInput): Promise<PaintingGenerationStart>;
}
