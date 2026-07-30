import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { FileEntryId, ResolvedFile } from '@/shared/data/types/file';
import type { UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

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
  dispose(): void;
  generate(input: PaintingGenerationInput, signal: AbortSignal): Promise<PaintingGenerationResult>;
}

export interface PaintingsBackend {
  createGenerationSession(): PaintingGenerationSession;
  resolveFiles(painting: Painting): Promise<ResolvedPaintingFiles>;
}
