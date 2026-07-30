import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { FileEntryId } from '@/shared/domain/file';
import type { UniqueModelId } from '@/shared/domain/model';
import type { Painting } from '@/shared/domain/painting';
import type { CursorPaginationResponse } from './dataTypes';
import type { ResolvedFile } from './files';

export type PaintingListQuery = {
  cursor?: string;
  limit?: number;
};

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
  get(id: string): Promise<Painting>;
  listIds(): Promise<string[]>;
  listPage(query?: PaintingListQuery): Promise<CursorPaginationResponse<Painting>>;
  removeMany(ids: readonly string[]): Promise<void>;
  resolveFiles(painting: Painting): Promise<ResolvedPaintingFiles>;
}
