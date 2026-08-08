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

export interface PaintingGenerationSession {
  cancel(): void;
  dispose(): void;
  generate(input: PaintingGenerationInput): Promise<PaintingGenerationResult>;
}

export interface PaintingsModule {
  createGenerationSession(): PaintingGenerationSession;
  resolveFiles(painting: Painting): Promise<ResolvedPaintingFiles>;
}
