import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

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
