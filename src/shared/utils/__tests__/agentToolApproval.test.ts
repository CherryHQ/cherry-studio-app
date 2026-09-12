import { applyToolApprovalMode, clampMcpToolApproval } from '../agentToolApproval';

describe('clampMcpToolApproval', () => {
  test('preserves an explicit deny', () => {
    expect(clampMcpToolApproval('deny')).toBe('deny');
  });

  test('clamps ask and legacy auto rows to ask', () => {
    expect(clampMcpToolApproval('ask')).toBe('ask');
    expect(clampMcpToolApproval('auto')).toBe('ask');
  });
});

describe('applyToolApprovalMode', () => {
  test('default mode keeps every approval unchanged', () => {
    expect(applyToolApprovalMode('auto', 'default')).toBe('auto');
    expect(applyToolApprovalMode('ask', 'default')).toBe('ask');
    expect(applyToolApprovalMode('deny', 'default')).toBe('deny');
  });

  test('auto mode promotes only ask', () => {
    expect(applyToolApprovalMode('ask', 'auto')).toBe('auto');
    expect(applyToolApprovalMode('auto', 'auto')).toBe('auto');
    expect(applyToolApprovalMode('deny', 'auto')).toBe('deny');
  });

  test('auto mode never promotes an ineligible ask', () => {
    // Cost-bearing (generate_image) and permission-gated asks state a consent
    // requirement, not an interaction preference.
    expect(applyToolApprovalMode('ask', 'auto', false)).toBe('ask');
    expect(applyToolApprovalMode('ask', 'default', false)).toBe('ask');
    expect(applyToolApprovalMode('deny', 'auto', false)).toBe('deny');
  });
});

describe('composed MCP policy', () => {
  test('the only path to auto for an MCP tool is the confirmed Agent mode', () => {
    expect(applyToolApprovalMode(clampMcpToolApproval('auto'), 'default')).toBe('ask');
    expect(applyToolApprovalMode(clampMcpToolApproval('ask'), 'auto')).toBe('auto');
  });

  test('an explicit deny survives both stages in every mode', () => {
    expect(applyToolApprovalMode(clampMcpToolApproval('deny'), 'default')).toBe('deny');
    expect(applyToolApprovalMode(clampMcpToolApproval('deny'), 'auto')).toBe('deny');
  });
});
