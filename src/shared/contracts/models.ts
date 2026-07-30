import type {
  EndpointType,
  Modality,
  Model,
  ModelCapability,
  ParameterSupport,
  ReasoningConfig,
  RuntimeModelPricing,
  UniqueModelId,
} from '@/shared/domain/model';

export type ModelListQuery = {
  capability?: string;
  enabled?: boolean;
  providerId?: string;
};

export type AddModelInput = {
  capabilities?: ModelCapability[];
  contextWindow?: number | null;
  description?: string | null;
  endpointTypes?: EndpointType[];
  group?: string | null;
  inputModalities?: Modality[];
  isDeprecated?: boolean;
  isEnabled?: boolean;
  isHidden?: boolean;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  modelId: string;
  name?: string | null;
  outputModalities?: Modality[];
  ownedBy?: string | null;
  parameters?: ParameterSupport | null;
  presetModelId?: string | null;
  pricing?: RuntimeModelPricing | null;
  providerId: string;
  reasoning?: ReasoningConfig | null;
  supportsStreaming?: boolean;
};

export type ModelPullPreview = {
  added: Model[];
  missing: Model[];
};

export type ModelPullResult =
  | { providerEnabled: boolean; status: 'up-to-date' }
  | { preview: ModelPullPreview; status: 'changes' };

export type ReconcileModelsInput = {
  toAdd?: readonly Model[];
  toRemove?: readonly UniqueModelId[];
};

export type ReconcileModelsResult = {
  added: Model[];
  providerEnabled: boolean;
  removedIds: UniqueModelId[];
};

export type ModelHealthStatus = 'checking' | 'failed' | 'pending' | 'success';

export type ModelHealthResult = {
  error?: string;
  latency?: number;
  model: Model;
  status: ModelHealthStatus;
};

export type CheckModelsHealthInput = {
  apiKey?: string;
  modelIds: readonly UniqueModelId[];
  onResult?: (result: ModelHealthResult, index: number) => void;
  providerId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export interface ModelsBackend {
  add(inputs: readonly AddModelInput[]): Promise<Model[]>;
  checkHealth(input: CheckModelsHealthInput): Promise<ModelHealthResult[]>;
  get(id: UniqueModelId): Promise<Model | null>;
  list(query?: ModelListQuery): Promise<Model[]>;
  pull(providerId: string, signal?: AbortSignal): Promise<ModelPullResult>;
  reconcile(providerId: string, input: ReconcileModelsInput): Promise<ReconcileModelsResult>;
  remove(id: UniqueModelId): Promise<boolean>;
}
