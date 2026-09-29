import type {
  ProviderModelAddCapability,
  ProviderModelAddEndpoint,
  ProviderModelCapabilities,
  ProviderModelPrimaryType,
} from '../../utils/providerModelAdd';
import type { ModelPricingDraft } from '../../utils/providerModelPricing';

export type ProviderModelLimitField = 'contextWindow' | 'maxInputTokens' | 'maxOutputTokens';

/** A text setting: what is stored, and what stands in for it when nothing is. */
export type ProviderModelTextSetting = { placeholder?: string; value: string };

/**
 * Every change is a single action. A saved model writes it straight through; a model being
 * added applies it to its draft. Actions that validate resolve to an error message, or
 * `undefined` once applied, so the editing sheet can keep the user's input on failure.
 */
export type ProviderModelSettingsActions = {
  rename: (name: string) => Promise<string | undefined>;
  setCapability: (capability: ProviderModelAddCapability, selected: boolean) => void;
  setEndpoint: (endpoint: ProviderModelAddEndpoint) => void;
  setGroup: (group: string) => Promise<string | undefined>;
  setLimit: (field: ProviderModelLimitField, value: string) => Promise<string | undefined>;
  setNotes?: (notes: string) => Promise<string | undefined>;
  setPricing: (pricing: ModelPricingDraft) => Promise<string | undefined>;
  setPrimaryType: (type: ProviderModelPrimaryType) => void;
  setSupportsStreaming: (value: boolean) => void;
};

/** What the model settings show and how they change, independent of persistence. */
export type ProviderModelSettingsValue = {
  actions: ProviderModelSettingsActions;
  capabilities: ProviderModelCapabilities;
  disabled: boolean;
  endpoint: {
    disabled?: boolean;
    error?: string;
    label: string;
    options: readonly { label: string; value: ProviderModelAddEndpoint }[];
    value: ProviderModelAddEndpoint;
  };
  group: ProviderModelTextSetting;
  /** Drawing models have no token limits to set. */
  limits?: Record<ProviderModelLimitField, ProviderModelTextSetting & { error?: string }>;
  name: ProviderModelTextSetting & { required: boolean };
  /** Absent while adding: notes are kept on saved models only. */
  notes?: ProviderModelTextSetting;
  primaryType: ProviderModelPrimaryType | null;
  pricing: ModelPricingDraft;
  /** An image-edit endpoint needs image input, so that input is fixed on. */
  requiresImageInput: boolean;
  supportsStreaming: boolean;
};
