import { tool } from 'ai';
import * as z from 'zod';

import { isApprovalGated } from '../isApprovalGated';

describe('isApprovalGated', () => {
  it('fails closed and reports a rejected approval check', async () => {
    const diagnostics = vi.fn();
    const guardedTool = tool({
      inputSchema: z.object({}),
      needsApproval: async () => {
        throw new Error('policy unavailable');
      },
    });

    await expect(
      isApprovalGated(guardedTool, { toolName: 'calendar_write' }, diagnostics),
    ).resolves.toBe(true);
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'approval-check-failed', toolName: 'calendar_write' }),
    );
  });
});
