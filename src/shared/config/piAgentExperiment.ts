import Constants from 'expo-constants';

const PI_DEBUG_ID = 'pi-luna-v1';

export interface PiAgentExperimentConfig {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  providerName: string;
}

export function getPiAgentExperimentConfig(): PiAgentExperimentConfig | undefined {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return undefined;

  const value = Constants.expoConfig?.extra?.piAgentExperiment;
  if (!isRecord(value)) return undefined;

  const apiKey = stringValue(value.apiKey);
  const baseUrl = stringValue(value.baseUrl);
  const modelId = stringValue(value.modelId);
  const providerName = stringValue(value.providerName);
  if (!apiKey || !baseUrl || !modelId || !providerName) return undefined;

  return { apiKey, baseUrl, modelId, providerName };
}

export function piDiagnostic(event: string, fields: Record<string, unknown> = {}): string {
  return `${Date.now()} [DEBUG ${PI_DEBUG_ID}] ${event} ${JSON.stringify(fields)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
