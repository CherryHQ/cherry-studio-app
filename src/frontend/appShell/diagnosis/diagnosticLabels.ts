import type { DiagnosticCheck, DiagnosticIssue } from '@/shared/contracts/diagnosticSession';
import type { ProviderConfigurationIssue } from '@/shared/contracts/providers';

export const issueKeys: Record<DiagnosticIssue, string> = {
  data: 'diagnosis.issue.data',
  runtime: 'diagnosis.issue.runtime',
  not_initialized: 'diagnosis.issue.not_initialized',
  missing_model: 'diagnosis.issue.missing_model',
  configuration: 'diagnosis.issue.configuration',
  authentication: 'diagnosis.issue.authentication',
  permission: 'diagnosis.issue.permission',
  quota: 'diagnosis.issue.quota',
  rate_limit: 'diagnosis.issue.rate_limit',
  network: 'diagnosis.issue.network',
  timeout: 'diagnosis.issue.timeout',
  model: 'diagnosis.issue.model',
  unavailable: 'diagnosis.issue.unavailable',
  unsupported: 'diagnosis.issue.unsupported',
  remote: 'diagnosis.issue.remote',
  storage: 'diagnosis.issue.storage',
  unknown: 'diagnosis.issue.unknown',
};
export const checkKeys: Record<DiagnosticCheck['id'], string> = {
  data: 'diagnosis.check.data',
  runtime: 'diagnosis.check.runtime',
  model: 'diagnosis.check.model',
  endpoint: 'diagnosis.check.endpoint',
  model_list: 'diagnosis.check.model_list',
  conversation: 'diagnosis.check.conversation',
  plugins: 'diagnosis.check.plugins',
  permissions: 'diagnosis.check.permissions',
  storage: 'diagnosis.check.storage',
};

export const configurationIssueKeys = {
  'missing-oauth': 'settings.provider.setup.issues.missing-oauth',
  'missing-api-key': 'diagnosis.missingApiKey',
  'disabled-api-keys': 'settings.provider.setup.issues.disabled-api-keys',
  'invalid-service-account': 'settings.provider.setup.issues.invalid-service-account',
  'invalid-endpoint': 'settings.provider.setup.issues.invalid-endpoint',
  'unsupported-auth': 'settings.provider.setup.issues.unsupported-auth',
  'disabled-provider': 'settings.provider.status.disabled',
} satisfies Record<ProviderConfigurationIssue | 'disabled-provider', string>;
export const statusKeys: Record<DiagnosticCheck['status'], string> = {
  pass: 'diagnosis.status.pass',
  warn: 'diagnosis.status.warn',
  fail: 'diagnosis.status.fail',
  skipped: 'diagnosis.status.skipped',
  error: 'diagnosis.status.error',
  pending: 'diagnosis.status.pending',
};
export const factKeys: Record<string, string> = {
  httpStatus: 'diagnosis.fact.httpStatus',
  latencyMs: 'diagnosis.fact.latencyMs',
  enabledCount: 'diagnosis.fact.enabledCount',
  connectedCount: 'diagnosis.fact.connectedCount',
  missingCount: 'diagnosis.fact.missingCount',
  freeBytes: 'diagnosis.fact.freeBytes',
};
