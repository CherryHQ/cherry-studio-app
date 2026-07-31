import type {
  EndpointType,
  Modality,
  Model,
  ModelCapability,
  ParameterSupport,
  ReasoningConfig,
  RuntimeModelPricing,
  UniqueModelId,
} from '@/shared/data/types/model';

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

export type ModelSchemas = {
  '/models': {
    GET: {
      query?: ModelListQuery;
      response: Model[];
    };
    POST: {
      body: readonly AddModelInput[];
      response: Model[];
    };
  };
  '/models/:id': {
    DELETE: {
      params: { id: UniqueModelId };
      response: boolean;
    };
    GET: {
      params: { id: UniqueModelId };
      response: Model | null;
    };
  };
};
