import type { DiagnosticCheck, DiagnosticIssue } from '@/shared/contracts/diagnosticSession';

export const issueKeys: Record<DiagnosticIssue, string> = {
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
  model: 'diagnosis.check.model',
  endpoint: 'diagnosis.check.endpoint',
  model_list: 'diagnosis.check.model_list',
  conversation: 'diagnosis.check.conversation',
  plugins: 'diagnosis.check.plugins',
  permissions: 'diagnosis.check.permissions',
  storage: 'diagnosis.check.storage',
};
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
