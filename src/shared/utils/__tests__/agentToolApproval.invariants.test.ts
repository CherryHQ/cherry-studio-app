import type { AgentToolApprovalMode } from '@/shared/data/types/agent';
import type { AgentToolApproval } from '@/shared/data/types/agentToolBinding';

import { applyToolApprovalMode, clampMcpToolApproval } from '../agentToolApproval';

const APPROVALS: readonly AgentToolApproval[] = ['auto', 'ask', 'deny'];
const MODES: readonly AgentToolApprovalMode[] = ['default', 'auto'];
const ELIGIBILITY_FLAGS = [true, false] as const;

describe('agentToolApproval exhaustive state-space invariants', () => {
  it('enforces A1-A4 across every (approval, mode, autoApprovalEligible) combination', () => {
    for (const approval of APPROVALS) {
      // A2: third-party MCP floor never emits `auto`.
      const clamped = clampMcpToolApproval(approval);
      expect(clamped).not.toBe('auto');

      // A4: clamp is idempotent.
      expect(clampMcpToolApproval(clamped)).toBe(clamped);

      for (const mode of MODES) {
        for (const eligible of ELIGIBILITY_FLAGS) {
          const direct = applyToolApprovalMode(approval, mode, eligible);
          const viaMcp = applyToolApprovalMode(clamped, mode, eligible);

          // A1: explicit deny is fail-closed across all modes and eligibility flags.
          if (approval === 'deny') {
            expect(direct).toBe('deny');
            expect(viaMcp).toBe('deny');
          }

          // A3: ineligible (cost- or permission-gated) `ask` is never promoted to `auto`.
          if (!eligible && approval === 'ask') {
            expect(direct).toBe('ask');
          }
          if (!eligible && clamped === 'ask') {
            expect(viaMcp).toBe('ask');
          }

          // A4: mode application is idempotent.
          expect(applyToolApprovalMode(direct, mode, eligible)).toBe(direct);
          expect(applyToolApprovalMode(viaMcp, mode, eligible)).toBe(viaMcp);
        }
      }
    }
  });
});
